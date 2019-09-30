#!/usr/bin/env node
import cdk = require('@aws-cdk/core')
import { StackTags } from 'ndlib-cdk'
import { UsurperStack } from '../src/usurper-stack'

const app = new cdk.App()
app.node.applyAspect(new StackTags())

const stage = app.node.tryGetContext('stage') || 'dev'

// tslint:disable-next-line:no-unused-expression
new UsurperStack(app, 'AppStack', {
  stackName: app.node.tryGetContext('serviceStackName') || `usurper-${stage}`,
  buildPath: app.node.tryGetContext('usurperBuildPath') || '../usurper/build',
  createDns: app.node.tryGetContext('createDns') === undefined ? true : app.node.tryGetContext('createDns') === 'true',
  domainStackName: app.node.tryGetContext('domainStackName') || 'libraries-domain',
  hostnamePrefix: app.node.tryGetContext('hostnamePrefix') || `usurper-${stage}`,
  stage,
})
