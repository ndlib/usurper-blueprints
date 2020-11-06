import codepipeline = require('@aws-cdk/aws-codepipeline')
import {
  CodeBuildAction,
  GitHubSourceAction,
  GitHubTrigger,
  ManualApprovalAction,
} from '@aws-cdk/aws-codepipeline-actions'
import { Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import sns = require('@aws-cdk/aws-sns')
import cdk = require('@aws-cdk/core')
import { CfnCondition, Fn, SecretValue } from '@aws-cdk/core'
import { PipelineNotifications } from '@ndlib/ndlib-cdk'
import ArtifactBucket from './artifact-bucket'
import QaProject from './qa-project'
import UsurperBuildProject from './usurper-build-project'
import UsurperBuildRole from './usurper-build-role'

const stages = ['test', 'prod']

export interface IUsurperPipelineStackProps extends cdk.StackProps {
  readonly gitOwner: string
  readonly gitTokenPath: string
  readonly usurperRepository: string
  readonly usurperBranch: string
  readonly blueprintsRepository: string
  readonly blueprintsBranch: string
  readonly contact: string
  readonly owner: string
  readonly sentryTokenPath: string
  readonly sentryOrg: string
  readonly sentryProject: string
  readonly createDns: boolean
  readonly domainStackName: string
  readonly hostnamePrefix: string
  readonly emailReceivers: string
  readonly websiteTestServerStack?: string
}

export class UsurperPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IUsurperPipelineStackProps) {
    super(scope, id, props)

    const ec2Id = props.websiteTestServerStack ? cdk.Fn.importValue(`${props.websiteTestServerStack}:InstanceId`) : undefined

    // S3 BUCKET FOR STORING ARTIFACTS
    const artifactBucket = new ArtifactBucket(this, 'ArtifactBucket', {})

    // IAM ROLES
    const codepipelineRole = new Role(this, 'CodePipelineRole', {
      assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
    })
    const codebuildRole = new UsurperBuildRole(this, 'CodeBuildTrustRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      stages,
      artifactBucket,
      createDns: props.createDns,
      domainStackName: props.domainStackName,
      ec2Id,
    })

    // CREATE PIPELINE
    const pipeline = new codepipeline.Pipeline(this, 'UsurperPipeline', {
      artifactBucket,
      role: codepipelineRole,
    })
    new PipelineNotifications(this, 'PipelineNotifications', {
      pipeline,
      receivers: props.emailReceivers,
    })

    // SOURCE CODE AND BLUEPRINTS
    const appSourceArtifact = new codepipeline.Artifact('AppCode')
    const appSourceAction = new GitHubSourceAction({
      actionName: 'SourceAppCode',
      owner: props.gitOwner,
      repo: props.usurperRepository,
      branch: props.usurperBranch,
      oauthToken: SecretValue.secretsManager(props.gitTokenPath, { jsonField: 'oauth' }),
      output: appSourceArtifact,
      trigger: GitHubTrigger.WEBHOOK,
    })
    const infraSourceArtifact = new codepipeline.Artifact('InfraCode')
    const infraSourceAction = new GitHubSourceAction({
      actionName: 'SourceInfraCode',
      owner: props.gitOwner,
      repo: props.blueprintsRepository,
      branch: props.blueprintsBranch,
      oauthToken: SecretValue.secretsManager(props.gitTokenPath, { jsonField: 'oauth' }),
      output: infraSourceArtifact,
      trigger: GitHubTrigger.NONE,
    })
    pipeline.addStage({
      stageName: 'Source',
      actions: [appSourceAction, infraSourceAction],
    })

    // MODIFY WEBHOOK SETTINGS... Not a super easy way to access these from cdk. Needs to be done after stage defined.
    const sourceStage = pipeline.node.findChild('Source')
    const sourceAppCode = sourceStage.node.findChild('SourceAppCode')
    const webhook = sourceAppCode.node.findChild('WebhookResource') as codepipeline.CfnWebhook
    // Only trigger on tag "ci" created. Must delete and re-create to move the tag and trigger pipeline.
    webhook.addPropertyOverride('Filters', [
      {
        JsonPath: '$.ref',
        MatchEquals: 'refs/tags/ci',
      },
      {
        JsonPath: '$.before',
        MatchEquals: '0000000000000000000000000000000000000000', // github sends this when a tag is created
      },
    ])

    // DEPLOY TO TEST
    new CfnCondition(this, 'IsTestlib', {
      expression: Fn.conditionEquals(this.account, this.node.tryGetContext('testlibndAccount')),
    })
    const deployToTestProject = new UsurperBuildProject(this, 'UsurperTestBuildProject', {
      ...props,
      stage: 'test',
      role: codebuildRole,
      // "Test" stage needs to be able to build in testlibnd even without the existence of stacks for usurper's services
      fakeServiceUrls: Fn.conditionIf('IsTestlib', 'true', 'false'),
    })
    const deployToTestAction = new CodeBuildAction({
      actionName: 'Build_and_Deploy',
      project: deployToTestProject,
      input: appSourceArtifact,
      extraInputs: [infraSourceArtifact],
      runOrder: 1,
    })

    // QA
    const automatedTestQAProject = new QaProject(this, 'AutomatedQaProject', {
      role: codebuildRole,
      testUrl:
        (props.createDns ? `${props.hostnamePrefix}-test.` : 'test.') +
        Fn.importValue(`${props.domainStackName}:DomainName`),
      ec2Id,
    })
    const automatedQaAction = new CodeBuildAction({
      actionName: 'Automated_QA',
      project: automatedTestQAProject,
      input: appSourceArtifact,
      runOrder: 2,
    })

    // APPROVAL
    const approvalTopic = new sns.Topic(this, 'PipelineApprovalTopic', {
      displayName: 'PipelineApprovalTopic',
    })
    const manualApprovalAction = new ManualApprovalAction({
      actionName: 'ManualApprovalOfTestEnvironment',
      notificationTopic: approvalTopic,
      additionalInformation: 'Approve or Reject this change after testing',
      runOrder: 3,
    })

    // TEST STAGE
    pipeline.addStage({
      stageName: 'DeployToTest',
      actions: [deployToTestAction, automatedQaAction, manualApprovalAction],
    })

    // DEPLOY TO PROD
    const deployToProdProject = new UsurperBuildProject(this, 'UsurperProdBuildProject', {
      ...props,
      stage: 'prod',
      role: codebuildRole,
    })
    const deployToProdAction = new CodeBuildAction({
      actionName: 'Build_and_Deploy',
      project: deployToProdProject,
      input: appSourceArtifact,
      extraInputs: [infraSourceArtifact],
    })

    // PROD STAGE
    pipeline.addStage({
      stageName: 'DeployToProd',
      actions: [deployToProdAction],
    })
  }
}
