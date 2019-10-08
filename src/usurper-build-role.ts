import { PolicyStatement, Role, RoleProps } from '@aws-cdk/aws-iam'
import { Bucket } from '@aws-cdk/aws-s3'
import cdk = require('@aws-cdk/core')
import { Fn } from '@aws-cdk/core'

export interface IUsurperBuildRoleProps extends RoleProps {
  readonly artifactBucket: Bucket
}

export class UsurperBuildRole extends Role {
  constructor(scope: cdk.Construct, id: string, props: IUsurperBuildRoleProps) {
    super(scope, id, props)

    const serviceStackPrefix = scope.node.tryGetContext('serviceStackName') || 'usurper'

    // Allow checking what policies are attached to this role
    this.addToPolicy(
      new PolicyStatement({
        resources: [this.roleArn],
        actions: ['iam:GetRolePolicy'],
      }),
    )
    // Allow modifying IAM roles related to our application
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:iam::${AWS::AccountId}:role/' + serviceStackPrefix + '-*')],
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
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*'),
        ],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    )
    // Allow storing artifacts in S3 buckets
    this.addToPolicy(
      new PolicyStatement({
        resources: [props.artifactBucket.bucketArn, 'arn:aws:s3:::cdktoolkit-stagingbucket-*'],
        actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'],
      }),
    )
    // Allow fetching details about and updating the application stack
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + serviceStackPrefix + '-*/*'),
        ],
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
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*')],
        actions: ['cloudformation:DescribeStacks'],
      }),
    )
    // Allow reading exports to get urls for other related services
    this.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: ['cloudformation:ListExports'],
      }),
    )
    // Allow creating and modifying cloudfront
    this.addToPolicy(
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
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/prep/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/test/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/prod/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sentry/*'),
        ],
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      }),
    )
  }
}

export default UsurperBuildRole
