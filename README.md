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

# Useful commands

 * `yarn build`   compile typescript to js
 * `yarn watch`   watch for changes and compile
 * `yarn test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
