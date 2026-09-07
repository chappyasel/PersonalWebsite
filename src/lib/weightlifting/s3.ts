import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { WldFile } from "./types";
import { env } from "~/env";

/**
 * When the phone last uploaded its backup — the S3 object's LastModified.
 * Returned as an ISO string so it survives JSON-serializing caches.
 */
export async function getWldLastModified(): Promise<string | null> {
  const s3 = new S3Client({ region: env.AWS_REGION });

  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: env.AWS_KEY_NAME,
    }),
  );

  return response.LastModified?.toISOString() ?? null;
}

/**
 * Download the .wld backup file from S3 using IAM credentials from env vars
 */
export async function downloadWldFromS3(): Promise<WldFile> {
  const s3 = new S3Client({ region: env.AWS_REGION });

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: env.AWS_KEY_NAME,
    }),
  );

  const body = await response.Body?.transformToString();
  if (!body) throw new Error("Empty response from S3");

  return JSON.parse(body) as WldFile;
}
