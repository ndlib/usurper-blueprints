import codebuild = require('@aws-cdk/aws-codebuild')
import { Role } from '@aws-cdk/aws-iam'
import cdk = require('@aws-cdk/core')
import { ICfnConditionExpression } from '@aws-cdk/core'

export interface IUsurperBuildProjectProps extends codebuild.PipelineProjectProps {
  readonly stage: string
  readonly role: Role
  readonly contact: string
  readonly owner: string
  readonly sentryTokenPath: string
  readonly sentryOrg: string
  readonly sentryProject: string
  readonly createDns: boolean
  readonly domainStackName: string
  readonly hostnamePrefix: string
  readonly fakeServiceUrls?: ICfnConditionExpression
}

export class UsurperBuildProject extends codebuild.PipelineProject {
  constructor(scope: cdk.Construct, id: string, props: IUsurperBuildProjectProps) {
    const serviceStackName = `${scope.node.tryGetContext('serviceStackName') || 'usurper'}-${props.stage}`
    const pipelineProps = {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        environmentVariables: {
          STACK_NAME: {
            value: serviceStackName,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          CI: {
            value: 'true',
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          STAGE: {
            value: props.stage,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          CONTACT: {
            value: props.contact,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          OWNER: {
            value: props.owner,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          SENTRY_AUTH_TOKEN: {
            value: props.sentryTokenPath,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          SENTRY_ORG: {
            value: props.sentryOrg,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          SENTRY_PROJECT: {
            value: props.sentryProject,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          CREATE_DNS: {
            value: props.createDns.toString(),
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          DOMAIN_STACK_NAME: {
            value: props.domainStackName,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          HOSTNAME_PREFIX: {
            value: props.hostnamePrefix,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          FAKE_SERVICE_URLS: {
            value: (props.fakeServiceUrls || false).toString(),
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
        },
      },
      role: props.role,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 10,
            },
            commands: [
              'echo "Ensure that the codebuild directory is executable"',
              'chmod -R 755 ./scripts/codebuild/*',
              'export BLUEPRINTS_DIR="$CODEBUILD_SRC_DIR_InfraCode"',
              './scripts/codebuild/install.sh',
            ],
          },
          pre_build: {
            commands: ['export VERSION=$(cat ./VERSION)', './scripts/codebuild/pre_build.sh'],
          },
          build: {
            commands: ['./scripts/codebuild/build.sh'],
          },
          post_build: {
            commands: [
              './scripts/codebuild/post_build.sh',
              'if [ $CODEBUILD_BUILD_SUCCEEDING = 1 ] && [ $STAGE != "prep" ]; then yarn sentry-cli releases deploys usurper@$VERSION new -e $STAGE; fi',
              'if [ $CODEBUILD_BUILD_SUCCEEDING = 1 ] && [ $STAGE = "prod" ]; then yarn sentry-cli releases finalize usurper@$VERSION; fi',
            ],
          },
        },
        artifacts: {
          files: ['build/**/*'],
        },
      }),
    }
    super(scope, id, pipelineProps)
  }
}

export default UsurperBuildProject
