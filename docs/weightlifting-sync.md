# Workout sync

The phone uploads a complete workout backup to S3 after a workout. The website imports that backup when S3 reports its creation. The existing daily Vercel job at 09:00 UTC remains a fallback.

## Upload scope

Only the production `AWS_BUCKET_NAME` and `AWS_KEY_NAME` are configured. The S3 notification filters on the complete key as a prefix because S3 notification filters do not offer exact equality. The Lambda decodes the event key and requires an exact bucket and key match before calling the website. Objects whose names merely start with that key are ignored, as are other buckets and deletion events. No bucket contents or workout records enter the Lambda logs.

The Lambda calls `POST https://www.chappyasel.com/api/cron/sync-weightlifting` with the existing production cron credential and an `x-workout-sync-source: s3` header. The header identifies the caller for sync history; authentication still requires the secret. The Lambda cannot read or write S3 or the database. Its role permits its logs and failure queue only. S3 invocation permission is restricted to the configured bucket and AWS account.

## Import behavior

All import callers take the same PostgreSQL transaction advisory lock before inspecting S3. An overlapping caller receives HTTP 503 and can retry. The lock is released on commit, rollback, or connection termination.

The importer uses S3 HEAD to compute a fingerprint from the bucket, key, ETag, version ID when present, content length, and date policy. It stores that fingerprint in the existing sync metadata `file_hash` field. Old content hashes deliberately cause one full import after deployment. Local-file imports retain their content hash behavior.

An unchanged fingerprint skips the download and database replacement. Changed objects are downloaded with `If-Match` so an upload that races the metadata check fails instead of being recorded under an older fingerprint. The importer reads the current object regardless of the event's age. It validates dates and replaces workout tables transactionally, committing success metadata in that same transaction. The existing snapshot survives a failed import. Webhook retries also invalidate caches when the fingerprint is unchanged, covering a previous failure after database commit.

## AWS resources and deployment

The CloudFormation stack `personalwebsite-workout-sync` owns the Lambda, its IAM role, a log group with 30-day retention, an encrypted SQS failure queue with 14-day retention, the async retry policy, S3 invocation permission, and a CloudWatch alarm for queued failures. The existing bucket stays outside the stack. The deployment script preserves unrelated bucket notifications and saves a private local copy before changing them.

Use a securely retrieved production environment file. Do not print its contents. The provisioning script defaults to the `awscli` profile; set `WORKOUT_DEPLOY_PROFILE` to select another explicitly. The website's S3 credentials are not used for provisioning. The script passes credentials through a temporary file with mode 0600 inside a private directory, removes it after each AWS request, and marks the CloudFormation secret parameter `NoEcho`.

```sh
node --env-file=/private/path/production.env scripts/weightlifting/aws/deploy.mjs
aws --profile awscli --region us-east-1 cloudformation describe-stacks \
  --stack-name personalwebsite-workout-sync \
  --query 'Stacks[0].StackStatus' --output text
```

Wait for `CREATE_COMPLETE` or `UPDATE_COMPLETE`. Deploy the importer through the repository's usual `main` push and verify Vercel Production is ready. Then enable the bucket notification:

```sh
node --env-file=/private/path/production.env scripts/weightlifting/aws/deploy.mjs --enable-trigger
```

The script does not enable uploads during stack creation, so the endpoint can be checked first. It uses the canonical `www` endpoint and refuses redirects. Updating the stack also refreshes the Lambda's copy of the cron credential after rotation.

## Failures and rollback

Lambda retries failed asynchronous deliveries twice. Exhausted deliveries go to `personalwebsite-workout-sync-failures`; the CloudWatch alarm `personalwebsite-workout-sync-failed-deliveries` changes state when the queue contains messages. The alarm has no email or messaging subscription. Inspect the queue before its 14-day retention expires, fix the endpoint or credential, and replay the original S3 request payload. The daily fallback independently checks the current backup.

The Lambda allows 195 seconds for the HTTP request, its timeout is 210 seconds, and the Vercel endpoint allows 180 seconds. Reserved concurrency is one. The database lock also covers the daily and manual callers.

To stop upload-triggered syncs while retaining the daily fallback and all workout data:

```sh
node --env-file=/private/path/production.env scripts/weightlifting/aws/deploy.mjs --disable-trigger
```

## Verification

```sh
pnpm exec vitest run scripts/weightlifting/aws/handler.test.ts \
  src/lib/weightlifting/sync.test.ts src/lib/weightlifting/s3.test.ts \
  src/lib/weightlifting/exportTimeZone.test.ts \
  src/app/api/cron/sync-weightlifting/route.test.ts
pnpm typecheck
```

Tests cover exact upload scope, authentication, unsuccessful delivery retries, notification preservation, metadata skips, conditional downloads, concurrent import rejection, date-validation failures, and cache invalidation on webhook retries.

This infrastructure change adds no visitor-facing action or discovery, so it does not add a Field Note.

AWS references: [S3 notification filtering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-filtering.html), [Lambda asynchronous retries](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), and [failed invocation destinations](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html).
