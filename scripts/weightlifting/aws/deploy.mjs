import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withWorkoutNotification, workoutSyncTemplate } from "./stack.mjs";

// Load the production environment with node --env-file. Explicit --profile
// keeps the website's read-only S3 credentials out of provisioning requests.
const profile = process.env.WORKOUT_DEPLOY_PROFILE ?? "awscli";
const region = process.env.AWS_REGION ?? "us-east-1";
const stack = "personalwebsite-workout-sync";
const bucket = process.env.AWS_BUCKET_NAME;
const key = process.env.AWS_KEY_NAME;
const secret = process.env.CRON_SECRET;
if (!bucket || !key || !secret)
  throw new Error("Production workout configuration is missing");

function aws(service, action, input) {
  const directory = mkdtempSync(join(tmpdir(), "workout-aws-request-"));
  chmodSync(directory, 0o700);
  const requestPath = join(directory, "request.json");
  writeFileSync(requestPath, JSON.stringify(input), { mode: 0o600 });
  try {
    const output = execFileSync(
      "aws",
      [
        "--profile",
        profile,
        "--region",
        region,
        service,
        action,
        "--cli-input-json",
        `file://${requestPath}`,
        "--output",
        "json",
      ],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return JSON.parse(output || "{}");
  } catch (error) {
    const detail = String(error.stderr ?? "");
    if (detail.includes("does not exist")) throw new Error("STACK_NOT_FOUND");
    if (detail.includes("No updates are to be performed")) return {};
    // AWS/CLI errors can echo parameter values. Expose only the error code.
    throw new Error(
      `${service} ${action} failed: ${detail.match(/\(([^)]+)\)/)?.[1] ?? "CLI error"}`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv.includes("--enable-trigger") ||
  process.argv.includes("--disable-trigger")
) {
  const state = aws("cloudformation", "describe-stacks", { StackName: stack })
    .Stacks[0];
  if (!["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(state.StackStatus))
    throw new Error(`Stack is not ready: ${state.StackStatus}`);
  const functionArn = state.Outputs.find(
    (o) => o.OutputKey === "FunctionArn",
  ).OutputValue;
  const before = aws("s3api", "get-bucket-notification-configuration", {
    Bucket: bucket,
  });
  const backup = mkdtempSync(join(tmpdir(), "workout-notifications-"));
  chmodSync(backup, 0o700);
  writeFileSync(join(backup, "before.json"), JSON.stringify(before, null, 2), {
    mode: 0o600,
  });
  aws("s3api", "put-bucket-notification-configuration", {
    Bucket: bucket,
    NotificationConfiguration: process.argv.includes("--disable-trigger")
      ? {
          ...before,
          LambdaFunctionConfigurations: (
            before.LambdaFunctionConfigurations ?? []
          ).filter((entry) => entry.Id !== "personalwebsite-workout-sync"),
        }
      : withWorkoutNotification(before, functionArn, key),
  });
  console.log(
    `Upload trigger ${process.argv.includes("--disable-trigger") ? "disabled" : "enabled"}. Previous notification configuration saved in ${backup}.`,
  );
} else {
  let exists = true;
  try {
    aws("cloudformation", "describe-stacks", { StackName: stack });
  } catch (error) {
    if (error.message === "STACK_NOT_FOUND") exists = false;
    else throw error;
  }
  aws("cloudformation", exists ? "update-stack" : "create-stack", {
    StackName: stack,
    TemplateBody: JSON.stringify(workoutSyncTemplate()),
    Capabilities: ["CAPABILITY_IAM"],
    Parameters: [
      { ParameterKey: "Bucket", ParameterValue: bucket },
      { ParameterKey: "ObjectKey", ParameterValue: key },
      { ParameterKey: "SyncSecret", ParameterValue: secret },
      {
        ParameterKey: "Endpoint",
        ParameterValue: workoutSyncTemplate().Parameters.Endpoint.Default,
      },
    ],
  });
  console.log(
    "AWS stack submitted. Verify completion and the deployed endpoint before enabling the trigger.",
  );
}
