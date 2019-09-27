#!/usr/bin/env node
import cdk = require('@aws-cdk/core')
import { execSync } from 'child_process'
import { StackTags } from 'ndlib-cdk'
import { UsurperPipelineStack } from '../src/usurper-pipeline-stack'
import { UsurperStack } from '../src/usurper-stack'

const app = new cdk.App()

if (!app.node.tryGetContext('owner')) {
  app.node.setContext(
    'owner',
    execSync('id -un')
      .toString()
      .trim(),
  )
}
if (!app.node.tryGetContext('contact')) {
  app.node.setContext(
    'contact',
    execSync('id -un')
      .toString()
      .trim() + '@nd.edu',
  )
}

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
// tslint:disable-next-line:no-unused-expression
new UsurperPipelineStack(app, 'PipelineStack', {
  stackName: app.node.tryGetContext('pipelineStackName') || `usurper-pipeline`,
  gitOwner: app.node.tryGetContext('gitOwner'),
  gitTokenPath: app.node.tryGetContext('gitTokenPath'),
  usurperRepository: app.node.tryGetContext('usurperRepository'),
  usurperBranch: app.node.tryGetContext('usurperBranch'),
  blueprintsRepository: app.node.tryGetContext('blueprintsRepository'),
  blueprintsBranch: app.node.tryGetContext('blueprintsBranch'),
  contact: app.node.tryGetContext('contact'),
  owner: app.node.tryGetContext('owner'),
  sentryTokenPath: app.node.tryGetContext('sentryTokenPath'),
  sentryOrg: app.node.tryGetContext('sentryOrg'),
  sentryProject: app.node.tryGetContext('sentryProject'),
})
