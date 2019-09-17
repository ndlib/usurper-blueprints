# usurper-blueprints
## Description
Infrastructure-as-code for the library website and its related

## Dependencies

  * [yarn](https://yarnpkg.com/lang/en/)
  * [AWS CLI](https://aws.amazon.com/cli/)
  * [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/tools.html)

## Installation
`./setup.sh`

## Testing
`yarn test`

## Deployment
```
cd deploy
cdk deploy
```

# Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
