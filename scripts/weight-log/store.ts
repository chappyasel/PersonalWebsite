import {
  WEIGHT_LOG_OBJECT_KEY,
  decryptWeightLog,
  encryptWeightLog,
} from "../../src/lib/weight-log/encryption";
import { weightLogSchema } from "../../src/lib/weight-log/schema";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Run with node --env-file=.env --import tsx. No credentials or source values are logged.
const secret = process.env.NEXTAUTH_SECRET ?? "";
const localFile = "data/weight-log/snapshot.enc";
const upload = process.argv.includes("--upload");

try {
  if (upload) {
    const body = await readFile(localFile);
    weightLogSchema.parse(JSON.parse(decryptWeightLog(body, secret)));
    const client = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
    const input = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: WEIGHT_LOG_OBJECT_KEY,
    };
    await client.send(
      new PutObjectCommand({
        ...input,
        Body: body,
        ACL: "private",
        ServerSideEncryption: "AES256",
        ContentType: "application/octet-stream",
        CacheControl: "private, no-store",
      }),
    );
    const response = await client.send(new GetObjectCommand(input));
    const stored = Buffer.from(await response.Body!.transformToByteArray());
    if (!stored.equals(body)) throw new Error("Snapshot readback failed");
    weightLogSchema.parse(JSON.parse(decryptWeightLog(stored, secret)));
    console.log("Encrypted snapshot uploaded and readback verified.");
  } else {
    let raw = "";
    for await (const chunk of process.stdin) {
      raw += String(chunk);
      if (raw.length > 5_000_000) throw new Error("Snapshot too large");
    }
    const snapshot = weightLogSchema.parse(JSON.parse(raw));
    const encrypted = encryptWeightLog(JSON.stringify(snapshot), secret);
    await mkdir("data/weight-log", { recursive: true, mode: 0o700 });
    await writeFile(localFile, encrypted, { mode: 0o600 });
    console.log("Encrypted local snapshot saved.");
  }
} catch {
  console.error(
    "Weight-log storage failed. Check the input, server secret, and storage permissions locally.",
  );
  process.exitCode = 1;
}
