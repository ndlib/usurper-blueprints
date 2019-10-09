#!/usr/bin/env node
import cdk = require('@aws-cdk/core')
import { StackTags } from '@ndlib/ndlib-cdk'
import { execSync } from 'child_process'
import { UsurperPipelineStack } from '../src/usurper-pipeline-stack'
import { UsurperPrepPipelineStack } from '../src/usurper-prep-pipeline-stack'
import { UsurperStack } from '../src/usurper-stack'

// The context values here are defaults only. Passing context in cli will override these
// Normally, you want to set constant defaults in cdk.json, but these are dynamic based on the executing user.
const app = new cdk.App({
  context: {
    owner: execSync('id -un')
      .toString()
      .trim(),
    contact:
      execSync('id -un')
        .toString()
        .trim() + '@nd.edu',
  },
})

app.node.applyAspect(new StackTags())

const stage = app.node.tryGetContext('stage') || 'dev'
const sharedProps = {
  createDns: app.node.tryGetContext('createDns') === undefined ? true : app.node.tryGetContext('createDns') === 'true',
  domainStackName: app.node.tryGetContext('domainStackName') || 'libraries-domain',
}

// tslint:disable-next-line:no-unused-expression
new UsurperStack(app, 'AppStack', {
  ...sharedProps,
  stackName: app.node.tryGetContext('serviceStackName') || `usurper-${stage}`,
  buildPath: app.node.tryGetContext('usurperBuildPath') || '../usurper/build',
  stage,
  hostnamePrefix: app.node.tryGetContext('hostnamePrefix') || `usurper-${stage}`,
})

const pipelineProps = {
  ...sharedProps,
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
}
// tslint:disable-next-line:no-unused-expression
new UsurperPipelineStack(app, 'PipelineStack', {
  ...pipelineProps,
  stackName: app.node.tryGetContext('pipelineStackName') || `usurper-pipeline`,
})
// tslint:disable-next-line:no-unused-expression
new UsurperPrepPipelineStack(app, 'PrepPipelineStack', {
  ...pipelineProps,
  stackName: app.node.tryGetContext('pipelineStackName') || `usurper-prep-pipeline`,
})
