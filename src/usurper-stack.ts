import { execSync } from 'child_process'
import cdk = require('@aws-cdk/core')
import { Fn, RemovalPolicy, CfnOutput } from '@aws-cdk/core'
import { Bucket, CfnBucket } from '@aws-cdk/aws-s3'
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment'
import { PolicyStatement, Effect, AnyPrincipal, CanonicalUserPrincipal } from '@aws-cdk/aws-iam'
import {
  CloudFrontWebDistribution, CloudFrontAllowedMethods, SecurityPolicyProtocol, SSLMethod,
  HttpVersion, PriceClass, ViewerProtocolPolicy
} from '@aws-cdk/aws-cloudfront'

export class UsurperStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Pre-deploy, get ACM certificate
    const stage = this.node.tryGetContext('stage') || 'dev'
    const fqdn = `usurper-${stage}.library.nd.edu`
    const certArn = this.getCertificateArn(fqdn) || this.getCertificateArn('*.library.nd.edu')

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
    bucket.addToResourcePolicy(new PolicyStatement({
      principals: [ new AnyPrincipal() ],
      effect: Effect.DENY,
      actions: ['s3:*'],
      conditions: {
        'Bool': { 'aws:SecureTransport': false }
      },
      resources: [bucket.bucketArn + '/*']
    }))
    // Allow WSE canonical user read access to the bucket
    bucket.addToResourcePolicy(new PolicyStatement({
      principals: [ new CanonicalUserPrincipal(Fn.importValue('wse-web-canonical-user-id')) ],
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [bucket.bucketArn + '/*']
    }))

    // NOTE: If you deploy directly from blueprints, it will use whatever build happens to be sitting at the build path.
    // It will NOT be rebuilt. To build and deploy, use usurper/scripts/codebuild/local.sh
    new BucketDeployment(this, 'DeployWebsite', {
      sources: [
        Source.asset(this.node.tryGetContext('usurperBuildPath') || '../usurper/build'),
      ],
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
        acmCertRef: certArn,
        names: [
          fqdn,
          // `${stage}.library.nd.edu`, <-- This will be added manually by ESU when cutting over to CI (?)
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
        }
      ],
      viewerProtocolPolicy: certArn ? ViewerProtocolPolicy.REDIRECT_TO_HTTPS : ViewerProtocolPolicy.ALLOW_ALL,
      loggingConfig: {
        bucket: Bucket.fromBucketName(this, 'CloudFrontLogBucket', Fn.importValue('wse-web-logs')),
        includeCookies: true,
        prefix: `web/${fqdn || 'unknown'}`,
      },
    })

    new CfnOutput(this, 'WebsiteCNAME', {
      value: cloudFront.domainName,
      description: 'Website CNAME target',
    })

    new CfnOutput(this, 'WebsiteBucketName', {
      value: bucket.bucketName,
      description: 'Name of S3 bucket to hold website content',
    })
  }

  getCertificateArn (domain: string): string {
    const result = execSync(`aws acm list-certificates --certificate-statuses ISSUED --includes extendedKeyUsage=TLS_WEB_SERVER_AUTHENTICATION --query "CertificateSummaryList[?DomainName=='${domain}']|[0]"`).toString()
    const json = JSON.parse(result) || {}
    return json.CertificateArn
  }
}
