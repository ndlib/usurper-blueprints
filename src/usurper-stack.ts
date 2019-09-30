import {
  CloudFrontAllowedMethods,
  CloudFrontWebDistribution,
  HttpVersion,
  PriceClass,
  SecurityPolicyProtocol,
  SSLMethod,
  ViewerProtocolPolicy,
} from '@aws-cdk/aws-cloudfront'
import { AnyPrincipal, CanonicalUserPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { Bucket, CfnBucket } from '@aws-cdk/aws-s3'
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment'
import cdk = require('@aws-cdk/core')
import { CfnOutput, Duration, Fn, RemovalPolicy } from '@aws-cdk/core'

export interface IUsurperStackProps extends cdk.StackProps {
  readonly buildPath: string
  readonly createDns: boolean
  readonly domainStackName: string
  readonly hostnamePrefix: string
  readonly stage: string
}

export class UsurperStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IUsurperStackProps) {
    super(scope, id, props)

    const domainNameImport = Fn.importValue(`${props.domainStackName}:DomainName`)
    const fqdn = `${props.hostnamePrefix}.${domainNameImport}`

    // Set up s3 bucket for storing the packaged site
    const bucket = new Bucket(this, 'UsurperBucket', {
      bucketName: this.stackName + Fn.sub('-${AWS::AccountId}'),
      removalPolicy: RemovalPolicy.DESTROY,
    })
    // High-level construct "Bucket" does not expose logging configuration yet, that's why we do it this way
    const cfnBucket = bucket.node.defaultChild as CfnBucket
    cfnBucket.loggingConfiguration = {
      destinationBucketName: Fn.importValue('wse-web-logs'),
      logFilePrefix: `s3/${fqdn || 'unknown'}/`,
    }

    // Explicitly deny insecure requests
    bucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [new AnyPrincipal()],
        effect: Effect.DENY,
        actions: ['s3:*'],
        conditions: {
          Bool: { 'aws:SecureTransport': false },
        },
        resources: [bucket.bucketArn + '/*'],
      }),
    )
    // Allow WSE canonical user read access to the bucket
    bucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [new CanonicalUserPrincipal(Fn.importValue('wse-web-canonical-user-id'))],
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [bucket.bucketArn + '/*'],
      }),
    )

    // NOTE: If you deploy directly from blueprints, it will use whatever build happens to be sitting at the build path.
    // It will NOT be rebuilt. To build and deploy, use usurper/scripts/codebuild/local.sh
    // tslint:disable-next-line:no-unused-expression
    new BucketDeployment(this, 'DeployWebsite', {
      sources: [Source.asset(props.buildPath)],
      destinationBucket: bucket,
    })

    // CloudFront for website
    const cloudFront = new CloudFrontWebDistribution(this, 'UsurperCloudFront', {
      originConfigs: [
        {
          behaviors: [
            {
              isDefaultBehavior: true,
              forwardedValues: {
                queryString: false,
              },
              allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
              compress: true,
            },
          ],
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentityId: Fn.importValue('wse-web-origin-access-identity'),
          },
        },
      ],
      httpVersion: HttpVersion.HTTP2,
      priceClass: PriceClass.PRICE_CLASS_100,
      comment: fqdn,
      aliasConfiguration: {
        acmCertRef: Fn.importValue(`${props.domainStackName}:ACMCertificateARN`),
        names: [
          fqdn,
          // `${props.stage}.library.nd.edu`, <-- This will be added manually by ESU when cutting over to CI (?)
        ],
        securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
        sslMethod: SSLMethod.SNI,
      },
      defaultRootObject: 'index.html',
      errorConfigurations: [
        {
          errorCode: 404,
          errorCachingMinTtl: 86400,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 403,
          errorCachingMinTtl: 86400,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      loggingConfig: {
        bucket: Bucket.fromBucketName(this, 'CloudFrontLogBucket', Fn.importValue('wse-web-logs')),
        includeCookies: true,
        prefix: `web/${fqdn || 'unknown'}`,
      },
    })

    // Create DNS record (conditionally)
    if (props.createDns) {
      // tslint:disable-next-line:no-unused-expression
      new CnameRecord(this, 'ServiceCNAME', {
        recordName: props.hostnamePrefix,
        domainName: cloudFront.domainName,
        zone: HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
          hostedZoneId: Fn.importValue(`${props.domainStackName}:Zone`),
          zoneName: domainNameImport,
        }),
        ttl: Duration.minutes(15),
      })
    }

    // tslint:disable-next-line:no-unused-expression
    new CfnOutput(this, 'WebsiteCNAME', {
      value: cloudFront.domainName,
      description: 'Website CNAME target',
    })

    // tslint:disable-next-line:no-unused-expression
    new CfnOutput(this, 'WebsiteBucketName', {
      value: bucket.bucketName,
      description: 'Name of S3 bucket to hold website content',
    })
  }
}
