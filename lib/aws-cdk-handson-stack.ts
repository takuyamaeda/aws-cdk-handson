import * as cdk from '@aws-cdk/core';
import {LogGroup, RetentionDays} from '@aws-cdk/aws-logs';

export class AwsCdkHandsonStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, 'LogGroup', {
        logGroupName: 'WebServerLogGroup',
        retention: RetentionDays.ONE_YEAR,
    });
  }
}
