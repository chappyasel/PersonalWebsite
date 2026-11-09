// Inputs for the one-time move from the workbook and encrypted snapshot into
// Postgres: the importer's JSON, the old snapshot, and its history companion.
// Delete this folder's cutover scripts once the database is the only source.
import {
  historicalContextSchema,
  weightLogSchema,
} from "../../src/lib/weight-log/schema";
import { createDecipheriv, hkdfSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const date = z.iso.date();
const nullableNumber = z.number().nullable();

/** The old snapshot, which still allows the removed `other` phase kind. */
export const legacySnapshotSchema = weightLogSchema.extend({
  phases: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: z.enum(["bulk", "cut", "maintenance", "other"]),
        start: date,
        end: date,
      }),
    )
    .max(500),
});
export type LegacySnapshot = z.infer<typeof legacySnapshotSchema>;

export const ADDED_SCAN_FIELDS = [
  "boneMineralContent",
  "armsFat",
  "armsLean",
  "armsBoneMineralContent",
  "legsFat",
  "legsLean",
  "legsBoneMineralContent",
  "trunkFat",
  "trunkLean",
  "trunkBoneMineralContent",
  "androidFat",
  "androidLean",
  "androidBoneMineralContent",
  "gynoidFat",
  "gynoidLean",
  "gynoidBoneMineralContent",
  "boneMineralDensity",
  "tScore",
  "zScore",
  "androidGynoidRatio",
  "visceralFat",
  "conditions",
] as const;

/** `import_workbook.py` output: the old snapshot plus every DEXA column. */
export const workbookExportSchema = legacySnapshotSchema.extend({
  scans: z
    .array(
      z.object({
        date,
        weight: z.number().positive(),
        leanMass: nullableNumber,
        fatMass: nullableNumber,
        bodyFatPercent: z.number().min(0).max(100).nullable(),
        boneMineralContent: nullableNumber,
        armsFat: nullableNumber,
        armsLean: nullableNumber,
        armsBoneMineralContent: nullableNumber,
        legsFat: nullableNumber,
        legsLean: nullableNumber,
        legsBoneMineralContent: nullableNumber,
        trunkFat: nullableNumber,
        trunkLean: nullableNumber,
        trunkBoneMineralContent: nullableNumber,
        androidFat: nullableNumber,
        androidLean: nullableNumber,
        androidBoneMineralContent: nullableNumber,
        gynoidFat: nullableNumber,
        gynoidLean: nullableNumber,
        gynoidBoneMineralContent: nullableNumber,
        boneMineralDensity: nullableNumber,
        tScore: nullableNumber,
        zScore: nullableNumber,
        androidGynoidRatio: nullableNumber,
        visceralFat: nullableNumber,
        conditions: z.string().max(1000).nullable(),
      }),
    )
    .max(2000),
});
export type WorkbookExport = z.infer<typeof workbookExportSchema>;

const MAGIC = Buffer.from("WEIGHTLOG1");

/** Decrypt an old `.enc` file in memory. The plaintext is never written. */
function decryptLegacy(payload: Buffer, secret: string) {
  if (!secret || secret.length < 32)
    throw new Error("Decrypting the old snapshot needs NEXTAUTH_SECRET");
  const offset = MAGIC.length;
  if (payload.length <= offset + 60) throw new Error("Invalid encrypted file");
  const salt = payload.subarray(offset, offset + 32);
  const key = Buffer.from(
    hkdfSync("sha256", secret, salt, "weight-log-snapshot-v1", 32),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    payload.subarray(offset + 32, offset + 44),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(payload.subarray(offset + 44, offset + 60));
  return Buffer.concat([
    decipher.update(payload.subarray(offset + 60)),
    decipher.final(),
  ]).toString("utf8");
}

/** Read a JSON file, or an old encrypted `.enc` file, without writing plaintext. */
export async function readPrivateJson(path: string, secret: string) {
  const bytes = await readFile(path);
  if (bytes.length > 5_000_000) throw new Error("Input too large");
  const text = bytes.subarray(0, MAGIC.length).equals(MAGIC)
    ? decryptLegacy(bytes, secret)
    : bytes.toString("utf8");
  return JSON.parse(text) as unknown;
}

export async function readLegacySnapshot(path: string, secret: string) {
  return legacySnapshotSchema.parse(await readPrivateJson(path, secret));
}

export async function readHistoricalContext(path: string, secret: string) {
  return historicalContextSchema.parse(await readPrivateJson(path, secret));
}

export async function readStdin(limit = 5_000_000) {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (raw.length > limit) throw new Error("Input too large");
  }
  return raw;
}
