import { PolicyStatement, Role, RoleProps } from '@aws-cdk/aws-iam'
import { Bucket } from '@aws-cdk/aws-s3'
import cdk = require('@aws-cdk/core')
import { Fn } from '@aws-cdk/core'

export interface IUsurperBuildRoleProps extends RoleProps {
  readonly stages: string[]
  readonly artifactBucket: Bucket
  readonly createDns: boolean
  readonly domainStackName: string
}

export class UsurperBuildRole extends Role {
  constructor(scope: cdk.Construct, id: string, props: IUsurperBuildRoleProps) {
    super(scope, id, props)

    const serviceStackPrefix = scope.node.tryGetContext('serviceStackName') || 'usurper'
    const serviceStacks = props.stages.map(stage => `${serviceStackPrefix}-${stage}`)

    // Allow checking what policies are attached to this role
    this.addToPolicy(
      new PolicyStatement({
        resources: [this.roleArn],
        actions: ['iam:GetRolePolicy'],
      }),
    )
    // Allow modifying IAM roles related to our application
    const iamStatement = new PolicyStatement({
      resources: [], // Added later dynamically
      actions: [
        'iam:GetRole',
        'iam:GetRolePolicy',
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:DeleteRolePolicy',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePolicy',
        'iam:PassRole',
        'iam:TagRole',
      ],
    })
    serviceStacks.forEach(stackName => {
      iamStatement.addResources(Fn.sub('arn:aws:iam::${AWS::AccountId}:role/' + stackName + '*'))
    })
    this.addToPolicy(iamStatement)

    // Global resource permissions for managing cloudfront and logs
    this.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: [
          'cloudformation:ListExports',
          'cloudfront:GetDistribution',
          'cloudfront:CreateDistribution',
          'cloudfront:UpdateDistribution',
          'cloudfront:TagResource',
          'cloudfront:CreateInvalidation',
          'logs:CreateLogGroup',
        ],
      }),
    )

    // Allow logging for this stack
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*'),
        ],
        actions: ['logs:CreateLogStream'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub(
            'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*:log-stream:*',
          ),
        ],
        actions: ['logs:PutLogEvents'],
      }),
    )

    // Allow storing artifacts in S3 buckets
    this.addToPolicy(
      new PolicyStatement({
        resources: [props.artifactBucket.bucketArn, 'arn:aws:s3:::cdktoolkit-stagingbucket-*'],
        actions: ['s3:ListBucket'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [props.artifactBucket.bucketArn + '/*', 'arn:aws:s3:::cdktoolkit-stagingbucket-*/*'],
        actions: ['s3:GetObject', 's3:PutObject'],
      }),
    )
    // Allow creating and managing s3 bucket for site
    const s3bucketStatement = new PolicyStatement({
      resources: [], // Added later dynamically
      actions: ['s3:CreateBucket', 's3:ListBucket*', 's3:GetBucket*', 's3:DeleteBucket*', 's3:PutBucket*'],
    })
    const s3objectsStatement = new PolicyStatement({
      resources: [], // Added later dynamically
      actions: ['s3:GetObject*', 's3:DeleteObject*', 's3:PutObject*', 's3:Abort*', 's3:ReplicateTags'],
    })
    serviceStacks.forEach(stackName => {
      s3bucketStatement.addResources(Fn.sub('arn:aws:s3:::' + stackName + '-${AWS::AccountId}'))
      s3objectsStatement.addResources(Fn.sub('arn:aws:s3:::' + stackName + '-${AWS::AccountId}/*'))
    })
    this.addToPolicy(s3bucketStatement)
    this.addToPolicy(s3objectsStatement)

    // Allow adding to cloudfront logs bucket
    this.addToPolicy(
      new PolicyStatement({
        resources: ['arn:aws:s3:::' + Fn.importValue('wse-web-logs')],
        actions: ['s3:GetBucketAcl', 's3:PutBucketAcl'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: ['arn:aws:s3:::' + Fn.importValue('wse-web-logs') + '/*'],
        actions: ['s3:PutObject*'],
      }),
    )
    // Allow creating and managing lambda with this stack name (needed for BucketDeployment construct)
    const lambdaStatement = new PolicyStatement({
      resources: [], // Added later dynamically
      actions: ['lambda:*'],
    })
    serviceStacks.forEach(stackName => {
      lambdaStatement.addResources(
        Fn.sub('arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:' + stackName + '*'),
      )
    })
    this.addToPolicy(lambdaStatement)

    // Allow fetching details about and updating the application stack
    const cfnStatement = new PolicyStatement({
      resources: [], // Added later dynamically
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
    })
    serviceStacks.forEach(stackName => {
      cfnStatement.addResources(
        Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + stackName + '/*'),
      )
    })
    this.addToPolicy(cfnStatement)

    // Allow reading some details about CDKToolkit stack so we can use the CDK CLI successfully from CodeBuild.
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*')],
        actions: ['cloudformation:DescribeStacks'],
      }),
    )
    // Allow creating DNS records in the domain stack's zone
    if (props.createDns) {
      this.addToPolicy(
        new PolicyStatement({
          resources: [
            Fn.sub('arn:aws:route53:::hostedzone/${importedZone}', {
              importedZone: Fn.importValue(`${props.domainStackName}:Zone`),
            }),
            'arn:aws:route53:::change/*',
          ],
          actions: ['route53:GetHostedZone', 'route53:ChangeResourceRecordSets', 'route53:GetChange'],
        }),
      )
    }
    // Allow getting parameters for usurper in parameter store
    const ssmStatement = new PolicyStatement({
      resources: [Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sentry/*')],
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
    })
    props.stages.forEach(stage => {
      ssmStatement.addResources(
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/usurper/' + stage + '/*'),
      )
    })
    this.addToPolicy(ssmStatement)
  }
}

export default UsurperBuildRole
