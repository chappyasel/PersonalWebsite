import { readFileSync } from "node:fs";

export function workoutSyncTemplate() {
  const functionName = "personalwebsite-workout-sync";
  const queueName = `${functionName}-failures`;
  /** @param {string} name */
  const ref = (name) => ({ Ref: name });
  /** @param {string} name */
  const arn = (name) => ({ "Fn::GetAtt": [name, "Arn"] });
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Sync the website when the phone uploads its workout backup",
    Parameters: {
      Bucket: { Type: "String" },
      ObjectKey: { Type: "String" },
      SyncSecret: { Type: "String", NoEcho: true },
      Endpoint: {
        Type: "String",
        Default: "https://www.chappyasel.com/api/cron/sync-weightlifting",
      },
    },
    Resources: {
      FailureQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: queueName,
          MessageRetentionPeriod: 1209600,
          SqsManagedSseEnabled: true,
        },
      },
      Logs: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: `/aws/lambda/${functionName}`,
          RetentionInDays: 30,
        },
      },
      Role: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "logs-and-failed-deliveries",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                    Resource: arn("Logs"),
                  },
                  {
                    Effect: "Allow",
                    Action: "sqs:SendMessage",
                    Resource: arn("FailureQueue"),
                  },
                ],
              },
            },
          ],
        },
      },
      Function: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: functionName,
          Runtime: "nodejs24.x",
          Handler: "index.handler",
          Role: arn("Role"),
          Timeout: 210,
          MemorySize: 128,
          ReservedConcurrentExecutions: 1,
          Code: {
            ZipFile: readFileSync(
              new URL("./handler.cjs", import.meta.url),
              "utf8",
            ),
          },
          Environment: {
            Variables: {
              WORKOUT_BUCKET: ref("Bucket"),
              WORKOUT_KEY: ref("ObjectKey"),
              SYNC_ENDPOINT: ref("Endpoint"),
              SYNC_SECRET: ref("SyncSecret"),
            },
          },
        },
      },
      RetryPolicy: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: {
          FunctionName: ref("Function"),
          Qualifier: "$LATEST",
          MaximumEventAgeInSeconds: 21600,
          MaximumRetryAttempts: 2,
          DestinationConfig: {
            OnFailure: { Destination: arn("FailureQueue") },
          },
        },
      },
      UploadPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: ref("Function"),
          Action: "lambda:InvokeFunction",
          Principal: "s3.amazonaws.com",
          SourceAccount: ref("AWS::AccountId"),
          SourceArn: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${Bucket}" },
        },
      },
      FailedDeliveryAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: `${functionName}-failed-deliveries`,
          AlarmDescription:
            "Workout sync exhausted retries. Inspect and replay the failure queue.",
          Namespace: "AWS/SQS",
          MetricName: "ApproximateNumberOfMessagesVisible",
          Dimensions: [{ Name: "QueueName", Value: queueName }],
          Statistic: "Maximum",
          Period: 300,
          EvaluationPeriods: 1,
          Threshold: 0,
          ComparisonOperator: "GreaterThanThreshold",
          TreatMissingData: "notBreaching",
        },
      },
    },
    Outputs: {
      FunctionArn: { Value: arn("Function") },
      FailureQueueUrl: { Value: ref("FailureQueue") },
    },
  };
}

/**
 * Preserve every notification that this integration does not own.
 * @typedef {{Id?: string, LambdaFunctionArn?: string, Events?: string[], Filter?: {Key: {FilterRules: Array<{Name: string, Value: string}>}}}} LambdaNotification
 * @param {{LambdaFunctionConfigurations?: LambdaNotification[], [key: string]: unknown}} existing
 * @param {string} functionArn
 * @param {string} key
 * @returns {{LambdaFunctionConfigurations: LambdaNotification[], [key: string]: unknown}}
 */
export function withWorkoutNotification(existing, functionArn, key) {
  return {
    ...existing,
    LambdaFunctionConfigurations: [
      ...(existing.LambdaFunctionConfigurations ?? []).filter(
        (entry) => entry.Id !== "personalwebsite-workout-sync",
      ),
      {
        Id: "personalwebsite-workout-sync",
        LambdaFunctionArn: functionArn,
        Events: ["s3:ObjectCreated:*"],
        Filter: {
          Key: {
            FilterRules: [
              {
                Name: "prefix",
                Value: encodeURIComponent(key).replace(/%2F/g, "/"),
              },
            ],
          },
        },
      },
    ],
  };
}
