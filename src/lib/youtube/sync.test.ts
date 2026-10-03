import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncYouTube } from "./sync";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  inserted: [] as Record<string, unknown>[][],
  completed: [] as Record<string, unknown>[],
}));

vi.mock("~/env", () => ({ env: { YOUTUBE_API_KEY: "test" } }));
vi.mock("./metadata", () => ({
  fetchYouTubeVideoMetadata: vi.fn(async () => new Map()),
  preferCanonicalMetadata: (fromTakeout: string | null) => fromTakeout,
}));
vi.mock("~/server/db", () => ({
  db: {
    execute: mocks.execute,
    select: () => ({ from: async () => [] }),
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        if (Array.isArray(values)) mocks.inserted.push(values);
        return {
          returning: async () => [{ id: 1 }],
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.completed.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));

const dirs: string[] = [];

function takeoutFile(entries: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-sync-"));
  dirs.push(dir);
  const historyPath = path.join(dir, "watch-history.json");
  fs.writeFileSync(historyPath, JSON.stringify(entries));
  return historyPath;
}

function watched(videoId: string, time?: string) {
  return {
    header: "YouTube",
    title: `Watched Video ${videoId}`,
    titleUrl: `https://www.youtube.com/watch?v=${videoId}`,
    subtitles: [{ name: "Channel", url: "https://www.youtube.com/channel/x" }],
    ...(time === undefined ? {} : { time }),
    products: ["YouTube"],
  };
}

beforeEach(() => {
  mocks.execute.mockReset().mockResolvedValue([]);
  mocks.inserted.length = 0;
  mocks.completed.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("syncYouTube", () => {
  it("skips and counts Watch Events whose timestamp cannot be read", async () => {
    const historyPath = takeoutFile([
      watched("aaaaaaaaaaa", "2026-09-11T21:30:00.000Z"),
      watched("bbbbbbbbbbb", "2026-09-31T25:61:00Z"),
      watched("ccccccccccc"),
      watched("ddddddddddd", "2026-09-10T18:00:00Z"),
    ]);

    const result = await syncYouTube("manual", historyPath);

    expect(result).toMatchObject({
      totalVideos: 2,
      skippedWatchEvents: 2,
      latestWatchAt: new Date("2026-09-11T21:30:00.000Z"),
    });
    expect(
      mocks.inserted.flat().map((row) => (row.watchedAt as Date).toISOString()),
    ).toEqual(["2026-09-11T21:30:00.000Z", "2026-09-10T18:00:00.000Z"]);
    expect(mocks.completed.at(-1)).toMatchObject({ status: "success" });
  });

  it("fails rather than record coverage for an archive it cannot read", async () => {
    const historyPath = takeoutFile([
      watched("aaaaaaaaaaa", "not a time"),
      watched("bbbbbbbbbbb", "also not a time"),
    ]);

    await expect(syncYouTube("manual", historyPath)).rejects.toThrow(
      /unreadable timestamp/,
    );
    expect(mocks.completed.at(-1)).toMatchObject({ status: "failed" });
    const wrote = mocks.execute.mock.calls.some(([query]) =>
      new PgDialect()
        .sqlToQuery(query as SQL)
        .sql.includes("INSERT INTO yt_watch_events"),
    );
    expect(wrote).toBe(false);
  });
});
