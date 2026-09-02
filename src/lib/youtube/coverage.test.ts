import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  parseTakeoutTimestamp,
  readExportProvenance,
  sidecarPathFor,
} from "./coverage";

const dirs: string[] = [];

function tempHistory(sidecar?: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-coverage-"));
  dirs.push(dir);
  const historyPath = path.join(dir, "watch-history.json");
  fs.writeFileSync(historyPath, "[]");
  if (sidecar !== undefined) {
    fs.writeFileSync(
      sidecarPathFor(historyPath),
      typeof sidecar === "string" ? sidecar : JSON.stringify(sidecar),
    );
  }
  return historyPath;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("sidecarPathFor", () => {
  it("sits beside the history file", () => {
    expect(sidecarPathFor("/data/watch-history.json")).toBe(
      "/data/watch-history.meta.json",
    );
  });
});

describe("parseTakeoutTimestamp", () => {
  it("reads the build time out of an archive name", () => {
    expect(
      parseTakeoutTimestamp(
        "takeout-20260830T231302Z-1-001.zip",
      )?.toISOString(),
    ).toBe("2026-08-30T23:13:02.000Z");
  });

  it("returns null for anything else", () => {
    expect(parseTakeoutTimestamp("watch-history.json")).toBeNull();
  });
});

describe("readExportProvenance", () => {
  it("trusts the sidecar", () => {
    const historyPath = tempHistory({
      exportCreatedAt: "2026-08-30T23:13:02.000Z",
      sourceFile: "takeout-20260830T231302Z-1-001.zip",
    });
    expect(readExportProvenance(historyPath)).toEqual({
      exportCreatedAt: new Date("2026-08-30T23:13:02.000Z"),
      sourceFile: "takeout-20260830T231302Z-1-001.zip",
    });
  });

  it("falls back to the archive name when the sidecar has no time", () => {
    const historyPath = tempHistory({
      sourceFile: "takeout-20260823T021359Z-1-001.zip",
    });
    expect(
      readExportProvenance(historyPath).exportCreatedAt?.toISOString(),
    ).toBe("2026-08-23T02:13:59.000Z");
  });

  it("falls back to the file's mtime when the sidecar is corrupt", () => {
    const historyPath = tempHistory("{not json");
    const { exportCreatedAt } = readExportProvenance(historyPath);
    expect(exportCreatedAt).toEqual(fs.statSync(historyPath).mtime);
  });

  it("reports nothing for a file that is not there", () => {
    expect(readExportProvenance("/nope/watch-history.json")).toEqual({
      exportCreatedAt: null,
      sourceFile: null,
    });
  });
});
