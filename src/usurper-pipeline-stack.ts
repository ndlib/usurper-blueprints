import codepipeline = require('@aws-cdk/aws-codepipeline')
import {
  CodeBuildAction,
  GitHubSourceAction,
  GitHubTrigger,
  ManualApprovalAction,
} from '@aws-cdk/aws-codepipeline-actions'
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import { Bucket } from '@aws-cdk/aws-s3'
import sns = require('@aws-cdk/aws-sns')
import cdk = require('@aws-cdk/core')
import { Fn, RemovalPolicy, SecretValue } from '@aws-cdk/core'
import UsurperBuildProject from './usurper-build-project'

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
}

export class UsurperPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IUsurperPipelineStackProps) {
    super(scope, id, props)

    // S3 BUCKET FOR STORING ARTIFACTS
    const artifactBucket = new Bucket(this, 'ArtifactBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
    })
    artifactBucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [new AnyPrincipal()],
        effect: Effect.DENY,
        actions: ['s3:*'],
        conditions: {
          Bool: { 'aws:SecureTransport': false },
        },
        resources: [artifactBucket.bucketArn + '/*'],
      }),
    )

    // IAM ROLES
    const codepipelineRole = new Role(this, 'CodePipelineRole', {
      assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
    })
    const codebuildRole = new Role(this, 'CodeBuildTrustRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
    })
    // Allow checking what policies are attached to this role
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [codebuildRole.roleArn],
        actions: ['iam:GetRolePolicy'],
      }),
    )
    // Allow modifying IAM roles related to our application
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:iam::${AWS::AccountId}:role/' + this.stackName + '-*')],
        actions: [
          'iam:GetRole',
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:DeleteRolePolicy',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:PassRole',
        ],
      }),
    )
    // Allow logging
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*'),
        ],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    )
    // Allow storing artifacts in S3 buckets
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [artifactBucket.bucketArn],
        actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'],
      }),
    )
    // Allow fetching details about and updating the application stack
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + this.stackName + '-*/*')],
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeChangeSet',
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:GetTemplate',
        ],
      }),
    )
    // Allow reading some details about CDKToolkit stack so we can use the CDK CLI successfully from CodeBuild.
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*')],
        actions: ['cloudformation:DescribeStacks'],
      }),
    )
    // Allow reading exports to get urls for other related services
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: ['cloudformation:ListExports'],
      }),
    )
    // Allow creating and modifying cloudfront
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: [
          'cloudfront:GetDistribution',
          'cloudfront:CreateDistribution',
          'cloudfront:UpdateDistribution',
          'cloudfront:TagResource',
          'cloudfront:CreateInvalidation',
        ],
      }),
    )
    // Allow getting parameters for usurper in parameter store
    codebuildRole.addToPolicy(
      new PolicyStatement({
        resources: [
          // TODO: Remove dev and move prep to the prep version of the pipeline
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/dev/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/prep/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/test/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/prod/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sentry/*'),
        ],
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      }),
    )

    // CREATE PIPELINE
    const pipeline = new codepipeline.Pipeline(this, 'UsurperPipeline', {
      artifactBucket,
      role: codepipelineRole,
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
    const deployToTestProject = new UsurperBuildProject(this, 'UsurperTestBuildProject', {
      ...props,
      stage: 'test',
      role: codebuildRole,
    })
    const deployToTestAction = new CodeBuildAction({
      actionName: 'Build_and_Deploy',
      project: deployToTestProject,
      input: appSourceArtifact,
      extraInputs: [infraSourceArtifact],
      runOrder: 1,
    })

    // APPROVAL
    const approvalTopic = new sns.Topic(this, 'PipelineApprovalTopic', {
      displayName: 'PipelineApprovalTopic',
    })
    const manualApprovalAction = new ManualApprovalAction({
      actionName: 'ManualApprovalOfTestEnvironment',
      notificationTopic: approvalTopic,
      additionalInformation: 'Approve or Reject this change after testing',
      runOrder: 2,
    })

    // TEST STAGE
    pipeline.addStage({
      stageName: 'DeployToTest',
      actions: [deployToTestAction, manualApprovalAction],
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
