# usurper-blueprints
## Description
Infrastructure-as-code for the [Hesburgh Libraries website](https://library.nd.edu/) ([usurper](https://github.com/ndlib/usurper))

## Dependencies

  * [yarn](https://yarnpkg.com/lang/en/)
  * [AWS CLI](https://aws.amazon.com/cli/)
  * [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/tools.html)

## Installation
`./setup.sh`

## Testing
`yarn test`

## Deployment
Assume role (or use aws-vault) and run:
```
cdk deploy usurper-pipeline -c owner=<netid> -c contact=<email>
```
For testlibnd deployment, additional context overrides are needed for the pipeline.
```
-c domainStackName=libraries-domain -c websiteTestServerStack=''
```
Recommended to use libraries domain to avoid CNAME conflicts with CloudFronts in libnd.

The `websiteTestServerStack` refers to the EC2 which serves as a proxy for hosting the website. This doesn't exist in testlibnd, so supplying a falsy value will allow us to skip the step of starting the ec2 when running smoke tests.

# Useful commands

 * `yarn build`   compile typescript to js
 * `yarn watch`   watch for changes and compile
 * `yarn test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
