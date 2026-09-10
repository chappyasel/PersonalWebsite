import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const MAGIC = Buffer.from("WEIGHTLOG1");
export const WEIGHT_LOG_OBJECT_KEY = "private/weight-log/snapshot-v1.enc";

function key(secret: string, salt: Buffer) {
  if (!secret || secret.length < 32)
    throw new Error(
      "Weight log requires a server secret of at least 32 characters",
    );
  return Buffer.from(
    hkdfSync("sha256", secret, salt, "weight-log-snapshot-v1", 32),
  );
}

export function encryptWeightLog(plaintext: string, secret: string): Buffer {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, salt), iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptWeightLog(payload: Buffer, secret: string): string {
  const offset = MAGIC.length;
  if (
    payload.length <= offset + 60 ||
    !payload.subarray(0, offset).equals(MAGIC)
  ) {
    throw new Error("Invalid weight log snapshot");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret, payload.subarray(offset, offset + 32)),
    payload.subarray(offset + 32, offset + 44),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(payload.subarray(offset + 44, offset + 60));
  return Buffer.concat([
    decipher.update(payload.subarray(offset + 60)),
    decipher.final(),
  ]).toString("utf8");
}
