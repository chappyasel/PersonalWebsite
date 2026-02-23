import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "~/env";

import type { WldFile } from "./types";

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
