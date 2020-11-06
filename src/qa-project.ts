import codebuild = require('@aws-cdk/aws-codebuild')
import { BuildEnvironmentVariableType } from '@aws-cdk/aws-codebuild'
import { Role } from '@aws-cdk/aws-iam'
import cdk = require('@aws-cdk/core')

export interface IQaProjectProps {
  readonly role: Role
  readonly testUrl: string
  readonly ec2Id?: string
}

export class QaProject extends codebuild.PipelineProject {
  constructor(scope: cdk.Construct, id: string, props: IQaProjectProps) {
    const pipelineProps = {
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
      },
      environmentVariables: {
        CI: { value: 'true', type: BuildEnvironmentVariableType.PLAINTEXT },
      },
      role: props.role,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '12.x',
            },
            commands: [
              'npm install -g newman',
              'echo "Ensure that the Newman spec is readable"',
              'chmod -R 755 ./scripts/codebuild/spec/*'
            ],
          },
          pre_build: props.ec2Id ? {
            commands: [
              `aws ec2 start-instances --instance-ids "${props.ec2Id}"`,
            ],
          } : null,
          build: {
            commands: [
              'echo "Beginning tests at `date`"',
              `newman run ./scripts/codebuild/spec/usurper.postman_collection.json --global-var "UsurperURL=${props.testUrl}"`,
            ],
          },
        },
      }),
    }
    super(scope, id, pipelineProps)
  }
}

export default QaProject
