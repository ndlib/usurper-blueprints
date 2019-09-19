#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { UsurperStack } from '../src/usurper-stack';
import { StackTags } from 'ndlib-cdk';

const app = new cdk.App()
app.node.applyAspect(new StackTags())

const stage = app.node.tryGetContext('stage') || 'dev'

new UsurperStack(app, 'UsurperStack', {
  stackName: `usurper-${stage}`,
})
