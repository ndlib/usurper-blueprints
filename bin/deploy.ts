#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { UsurperStack } from '../src/usurper-stack';

const app = new cdk.App();

new UsurperStack(app, 'UsurperStack');
