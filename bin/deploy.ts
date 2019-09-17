#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { UsurperStack } from '../lib/usurper-stack';

const app = new cdk.App();

new UsurperStack(app, 'UsurperStack');
