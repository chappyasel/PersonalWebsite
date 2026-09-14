import { WEIGHT_LOG_OBJECT_KEY } from "../../src/lib/weight-log/encryption";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { parseArgs } from "node:util";

import { restoreLocalWeightLog } from "./restore-local";

// Match Next.js development precedence without printing environment values.
config({
  path: [".env.development.local", ".env.local", ".env.development", ".env"],
  quiet: true,
});

try {
  const { values } = parseArgs({
    options: { "source-root": { type: "string" } },
  });
  const result = await restoreLocalWeightLog({
    workspaceRoot: process.cwd(),
    sourceRoot: values["source-root"],
    secret: process.env.NEXTAUTH_SECRET ?? "",
    download: async () => {
      const client = new S3Client({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: WEIGHT_LOG_OBJECT_KEY,
          }),
        );
        if (!response.Body || (response.ContentLength ?? 0) > 5_000_000) {
          throw new Error("Invalid snapshot");
        }
        return Buffer.from(await response.Body.transformToByteArray());
      } finally {
        client.destroy();
      }
    },
  });
  console.log(
    `Weight-log snapshot ${result}; decryption and schema validation passed.`,
  );
} catch {
  console.error(
    "Weight-log restore failed. Check the development server secret, local encrypted files, and S3 read access, then rerun pnpm restore:weight-log. Existing files are never overwritten.",
  );
  process.exitCode = 1;
}
