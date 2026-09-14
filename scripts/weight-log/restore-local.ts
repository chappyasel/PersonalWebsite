import {
  decryptWeightLog,
  encryptWeightLog,
} from "../../src/lib/weight-log/encryption";
import {
  historicalContextSchema,
  weightLogSchema,
} from "../../src/lib/weight-log/schema";
import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

async function readOptional(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

/** Publish complete ciphertext without overwriting an existing local file. */
async function createPrivateFile(path: string, bytes: Buffer) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function restoreLocalWeightLog({
  workspaceRoot,
  sourceRoot,
  secret,
  download,
}: {
  workspaceRoot: string;
  sourceRoot?: string;
  secret: string;
  download: () => Promise<Buffer>;
}) {
  const directory = join(workspaceRoot, "data/weight-log");
  const snapshotPath = join(directory, "snapshot.enc");
  const existing = await readOptional(snapshotPath);
  const source =
    !existing && sourceRoot
      ? await readOptional(join(sourceRoot, "data/weight-log/snapshot.enc"))
      : undefined;
  const encrypted = existing ?? source ?? (await download());
  if (encrypted.length > 5_000_000) throw new Error("Snapshot too large");
  const snapshot = weightLogSchema.parse(
    JSON.parse(decryptWeightLog(encrypted, secret)),
  );

  // Preserve the separate authoritative history before future workbook imports.
  const historyPath = join(directory, "history-context.enc");
  const existingHistory = await readOptional(historyPath);
  let history = existingHistory;
  if (!history && sourceRoot) {
    history = await readOptional(
      join(sourceRoot, "data/weight-log/history-context.enc"),
    );
  }
  if (history) {
    historicalContextSchema.parse(
      JSON.parse(decryptWeightLog(history, secret)),
    );
  } else if (snapshot.historicalContext) {
    history = encryptWeightLog(
      JSON.stringify(snapshot.historicalContext),
      secret,
    );
  }

  if (!existingHistory && history)
    await createPrivateFile(historyPath, history);
  if (!existing) await createPrivateFile(snapshotPath, encrypted);
  return existing ? "existing" : source ? "copied" : "downloaded";
}
