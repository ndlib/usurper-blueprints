#!/usr/bin/env node
import cdk = require('@aws-cdk/core')
import { StackTags } from 'ndlib-cdk'
import { UsurperStack } from '../src/usurper-stack'

const app = new cdk.App()
app.node.applyAspect(new StackTags())

const stage = app.node.tryGetContext('stage') || 'dev'

// tslint:disable-next-line:no-unused-expression
new UsurperStack(app, 'AppStack', {
  stackName: `usurper-${stage}`,
})
