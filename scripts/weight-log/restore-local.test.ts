import {
  decryptWeightLog,
  encryptWeightLog,
} from "../../src/lib/weight-log/encryption";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreLocalWeightLog } from "./restore-local";

const secret = "synthetic-secret".repeat(4);
const context = {
  anchor: {
    date: "2020-01-01",
    bodyFatLow: 20,
    bodyFatHigh: 25,
    note: "Synthetic",
  },
  strength: [],
};
const fixture = {
  version: 1,
  importedAt: "2020-01-01",
  sourceModifiedAt: "2020-01-01",
  historicalContext: context,
  setPoints: [],
  phases: [],
  weeks: [],
  scans: [],
};
const encrypted = encryptWeightLog(JSON.stringify(fixture), secret);

describe("local weight-log restoration", () => {
  let root: string;
  let workspaceRoot: string;
  let sourceRoot: string;
  const download = vi.fn<() => Promise<Buffer>>();
  const snapshotPath = () =>
    join(workspaceRoot, "data/weight-log/snapshot.enc");
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "weight-log-restore-"));
    workspaceRoot = join(root, "workspace");
    sourceRoot = join(root, "main");
    download.mockReset().mockResolvedValue(encrypted);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("bootstraps a fresh checkout and preserves history for later imports", async () => {
    await restoreLocalWeightLog({ workspaceRoot, secret, download });
    expect(await readFile(snapshotPath())).toEqual(encrypted);
    const history = await readFile(
      join(workspaceRoot, "data/weight-log/history-context.enc"),
    );
    expect(JSON.parse(decryptWeightLog(history, secret))).toEqual(context);
    expect((await stat(snapshotPath())).mode & 0o777).toBe(0o600);
    expect(
      (await stat(join(workspaceRoot, "data/weight-log"))).mode & 0o777,
    ).toBe(0o700);
    expect(download).toHaveBeenCalledOnce();
  });
  it("copies the main checkout and its authoritative companion without network access", async () => {
    const directory = join(sourceRoot, "data/weight-log");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "snapshot.enc"), encrypted);
    const newerHistory = encryptWeightLog(
      JSON.stringify({
        ...context,
        strength: [{ date: "2021-01-01", lift: "Synthetic lift", value: 100 }],
      }),
      secret,
    );
    await writeFile(join(directory, "history-context.enc"), newerHistory);
    await restoreLocalWeightLog({
      workspaceRoot,
      sourceRoot,
      secret,
      download,
    });
    expect(await readFile(snapshotPath())).toEqual(encrypted);
    expect(
      await readFile(
        join(workspaceRoot, "data/weight-log/history-context.enc"),
      ),
    ).toEqual(newerHistory);
    expect(download).not.toHaveBeenCalled();
  });
  it("falls back to download when the main checkout also lacks a snapshot", async () => {
    await restoreLocalWeightLog({
      workspaceRoot,
      sourceRoot,
      secret,
      download,
    });
    expect(await readFile(snapshotPath())).toEqual(encrypted);
    expect(download).toHaveBeenCalledOnce();
  });
  it("leaves valid existing local files unchanged on repeated setup", async () => {
    await restoreLocalWeightLog({ workspaceRoot, secret, download });
    const before = await stat(snapshotPath());
    const historyPath = join(
      workspaceRoot,
      "data/weight-log/history-context.enc",
    );
    const history = await readFile(historyPath);
    download.mockClear();
    await restoreLocalWeightLog({
      workspaceRoot,
      sourceRoot,
      secret,
      download,
    });
    expect((await stat(snapshotPath())).mtimeMs).toBe(before.mtimeMs);
    expect(await readFile(historyPath)).toEqual(history);
    expect(download).not.toHaveBeenCalled();
  });
  it.each([
    Buffer.from("corrupt ciphertext"),
    encryptWeightLog(JSON.stringify(fixture), "different-secret".repeat(4)),
    encryptWeightLog('{"version":99}', secret),
  ])("rejects unusable downloads before creating a snapshot", async (bytes) => {
    download.mockResolvedValue(bytes);
    await expect(
      restoreLocalWeightLog({ workspaceRoot, secret, download }),
    ).rejects.toThrow();
    await expect(readFile(snapshotPath())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("does not replace a corrupt existing file or hide it with a download", async () => {
    await mkdir(join(workspaceRoot, "data/weight-log"), { recursive: true });
    await writeFile(snapshotPath(), "corrupt");
    await expect(
      restoreLocalWeightLog({ workspaceRoot, secret, download }),
    ).rejects.toThrow();
    expect(await readFile(snapshotPath(), "utf8")).toBe("corrupt");
    expect(download).not.toHaveBeenCalled();
  });
  it("propagates a download failure without creating local data", async () => {
    download.mockRejectedValue(new Error("synthetic access failure"));
    await expect(
      restoreLocalWeightLog({ workspaceRoot, secret, download }),
    ).rejects.toThrow();
    await expect(readFile(snapshotPath())).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
