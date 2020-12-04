import * as cdk from '@aws-cdk/core';
import {LogGroup, RetentionDays} from '@aws-cdk/aws-logs';
import {BlockPublicAccess, Bucket} from '@aws-cdk/aws-s3';
import {Duration} from '@aws-cdk/core';
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {Code, Function, Runtime, Tracing} from '@aws-cdk/aws-lambda';
import * as path from 'path';
import {CfnDeliveryStream} from '@aws-cdk/aws-kinesisfirehose';

export class AwsCdkHandsonStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: 'WebServerLogGroup',
      retention: RetentionDays.ONE_YEAR,
    });

    const logBakupBucket = new Bucket(this, 'LogBackupBucket', {
      bucketName: 'log-backup-bucket-20201201',
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });

    const roleKinesisFirehose = new Role(this, 'roleKinesisFirehose', {
      roleName: 'firehose_delivery_role',
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
      inlinePolicies: {
        firehose_delivery_policy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'ec2:DescribeVpcs',
                'ec2:DescribeVpcAttribute',
                'ec2:DescribeSubnets',
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeNetworkInterfaces',
                'ec2:CreateNetworkInterface',
                'ec2:CreateNetworkInterfacePermission',
                'ec2:DeleteNetworkInterface',
              ],
              resources: ['*'],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                's3:AbortMultipartUpload',
                's3:GetBucketLocation',
                's3:GetObject',
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:PutObject',
              ],
              resources: [
                logBakupBucket.bucketArn,
                logBakupBucket.bucketArn + '/*',
              ],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
                'lambda:GetFunctionConfiguration',
              ],
              resources: [
                'arn:aws:lambda:*:*:function:%FIREHOSE_DEFAULT_FUNCTION%:%FIREHOSE_DEFAULT_VERSION%',
              ],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['logs:PutLogEvents'],
              resources: ['arn:aws:logs:*:*:log-group:/aws/kinesisfirehose/*'],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'kinesis:DescribeStream',
                'kinesis:GetShardIterator',
                'kinesis:GetRecords',
              ],
              resources: ['arn:aws:kinesis:*:*:stream/%FIREHOSE_STREAM_NAME%'],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['kms:Decrypt'],
              resources: ['arn:aws:kms:*:*:key/%SSE_KEY_ID%'],
              conditions: {
                StringEquals: {
                  'kms:ViaService': 'kinesis.%REGION_NAME%.amazonaws.com',
                },
                StringLike: {
                  'kms:EncryptionContext:aws:kinesis:arn':
                    'arn:aws:kinesis:%REGION_NAME%:*:stream/%FIREHOSE_STREAM_NAME%',
                },
              },
            }),
          ],
          assignSids: true,
        }),
      },
    });

    const functionLogProcessor = new Function(
      this,
      'kinesisFirehoseCloudWatchLogsProcessor',
      {
        functionName: 'kinesis-firehose-cloudwatch-logs-processor',
        runtime: Runtime.NODEJS_12_X,
        handler: 'index.handler',
        code: Code.fromAsset(
          path.join(__dirname, 'kinesis-firehose-cloudwatch-logs-processor')
        ),
        tracing: Tracing.ACTIVE,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['firehose:PutRecordBatch'],
            resources: ['arn:aws:firehose:*'],
          }),
        ],
        timeout: Duration.minutes(5),
      }
    );
    functionLogProcessor.grantInvoke(roleKinesisFirehose);

    const streamKinesisFirehose = new CfnDeliveryStream(
      this,
      'deliveryStreamCloudWatchLog',
      {
        deliveryStreamName: 'CloudWatchLogStream',
        deliveryStreamType: 'DirectPut',
        extendedS3DestinationConfiguration: {
          bucketArn: logBakupBucket.bucketArn,
          roleArn: roleKinesisFirehose.roleArn,
          bufferingHints: {
            intervalInSeconds: 60,
            sizeInMBs: 1,
          },
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: '/aws/kinesisfirehose/CloudWatchLogStream',
            logStreamName: 'CloudWatchLogStream',
          },
          compressionFormat: 'GZIP',
          prefix: 'cloud_watch_log/',
          processingConfiguration: {
            enabled: true,
            processors: [
              {
                type: 'Lambda',
                parameters: [
                  {
                    parameterName: 'BufferIntervalInSeconds',
                    parameterValue: '60',
                  },
                  {
                    parameterName: 'BufferSizeInMBs',
                    parameterValue: '1',
                  },
                  {
                    parameterName: 'LambdaArn',
                    parameterValue: functionLogProcessor.functionArn,
                  },
                ],
              },
            ],
          },
        },
      }
    );
  }
}
