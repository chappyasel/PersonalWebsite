import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import "server-only";

import { WEIGHT_LOG_OBJECT_KEY, decryptWeightLog } from "./encryption";
import { weightLogSchema } from "./schema";
import { env } from "~/env";

/** Load the public chart from the encrypted, server-only snapshot. */
export async function getWeightLog() {
  let encrypted: Buffer;
  if (env.NODE_ENV !== "production") {
    // Never trace or package local data into a deployment.
    encrypted = await readFile(
      [process.cwd(), "data", "weight-log", "snapshot.enc"].join("/"),
    );
  } else {
    const client = new S3Client({ region: env.AWS_REGION });
    const response = await client.send(
      new GetObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: WEIGHT_LOG_OBJECT_KEY,
      }),
    );
    if (!response.Body || (response.ContentLength ?? 0) > 5_000_000)
      throw new Error("Invalid snapshot");
    encrypted = Buffer.from(await response.Body.transformToByteArray());
  }
  return weightLogSchema.parse(
    JSON.parse(decryptWeightLog(encrypted, env.NEXTAUTH_SECRET ?? "")),
  );
}
