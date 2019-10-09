import codepipeline = require('@aws-cdk/aws-codepipeline')
import { CodeBuildAction, GitHubSourceAction, GitHubTrigger } from '@aws-cdk/aws-codepipeline-actions'
import { Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import cdk = require('@aws-cdk/core')
import { SecretValue } from '@aws-cdk/core'
import ArtifactBucket from './artifact-bucket'
import UsurperBuildProject from './usurper-build-project'
import UsurperBuildRole from './usurper-build-role'
import { IUsurperPipelineStackProps } from './usurper-pipeline-stack'

export class UsurperPrepPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IUsurperPipelineStackProps) {
    super(scope, id, props)

    // S3 BUCKET FOR STORING ARTIFACTS
    const artifactBucket = new ArtifactBucket(this, 'ArtifactBucket', {})

    // IAM ROLES
    const codepipelineRole = new Role(this, 'CodePipelineRole', {
      assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
    })
    const codebuildRole = new UsurperBuildRole(this, 'CodeBuildTrustRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      artifactBucket,
      createDns: props.createDns,
      domainStackName: props.domainStackName,
    })

    // CREATE PIPELINE
    const pipeline = new codepipeline.Pipeline(this, 'UsurperPrepPipeline', {
      artifactBucket,
      role: codepipelineRole,
    })

    // SOURCE CODE AND BLUEPRINTS
    const appSourceArtifact = new codepipeline.Artifact('AppCode')
    const appSourceAction = new GitHubSourceAction({
      actionName: 'SourceAppCode',
      owner: props.gitOwner,
      repo: props.usurperRepository,
      branch: 'prep',
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

    // DEPLOY TO PREP
    const deployToPrepProject = new UsurperBuildProject(this, 'UsurperPrepBuildProject', {
      ...props,
      stage: 'prep',
      role: codebuildRole,
    })
    const deployToPrepAction = new CodeBuildAction({
      actionName: 'Build_and_Deploy',
      project: deployToPrepProject,
      input: appSourceArtifact,
      extraInputs: [infraSourceArtifact],
    })

    // DEPLOY STAGE
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployToPrepAction],
    })
  }
}
