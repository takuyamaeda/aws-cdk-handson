#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsCdkHandsonStack } from '../lib/aws-cdk-handson-stack';

const app = new cdk.App();
new AwsCdkHandsonStack(app, 'AwsCdkHandsonStack');
