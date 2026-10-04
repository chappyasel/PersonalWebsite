import type { TakeoutSidecar } from "../../src/lib/youtube/coverage";
import type { drive_v3 } from "googleapis";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { downloadLatestArchive } from "./download";

const mocks = vi.hoisted(() => ({
  home: "",
  list: vi.fn<
    (args: { pageToken?: string }) => Promise<{
      data: { files: drive_v3.Schema$File[]; nextPageToken?: string };
    }>
  >(),
  get: vi.fn<(args: { fileId: string }) => Promise<{ data: Readable }>>(),
}));
vi.mock("dotenv/config", () => ({}));
vi.mock("./drive", () => ({
  getDrive: () => ({ files: { list: mocks.list, get: mocks.get } }),
}));

const youtube = {
  id: "youtube-archive",
  name: "takeout-20260928T055945Z-1-001.zip",
  createdTime: "2026-09-28T06:04:58.013Z",
};
let zipNumber = 0;
function zip(member: string, content = "[]") {
  const directory = path.join(mocks.home, `zip-${zipNumber++}`);
  fs.mkdirSync(path.dirname(path.join(directory, member)), { recursive: true });
  fs.writeFileSync(path.join(directory, member), content);
  execFileSync("zip", ["-q", "archive.zip", member], { cwd: directory });
  return fs.readFileSync(path.join(directory, "archive.zip"));
}
function sidecar() {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        mocks.home,
        ".local/share/youtube-takeout/watch-history.meta.json",
      ),
      "utf8",
    ),
  ) as TakeoutSidecar;
}

beforeEach(() => {
  mocks.home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-download-"));
  vi.stubEnv(
    "YOUTUBE_TAKEOUT_DATA_DIR",
    path.join(mocks.home, ".local/share/youtube-takeout"),
  );
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", path.join(mocks.home, "state"));
  vi.stubEnv(
    "YOUTUBE_TAKEOUT_CREDENTIALS_DIR",
    path.join(mocks.home, "credentials"),
  );
  mocks.list.mockReset();
  mocks.get.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(mocks.home, { recursive: true, force: true });
});

it("paginates, inspects service archives, stages truthful coverage, and skips the successful watermark next tick", async () => {
  const otherZip = zip("Takeout/Other/data.json");
  const youtubeZip = zip(
    "Takeout/YouTube and YouTube Music/history/watch-history.json",
    '[{"title":"fixture"}]',
  );
  const other = {
    id: "other",
    name: "takeout-20260928T055944Z-001.zip",
    createdTime: "2026-09-28T06:05:00Z",
  };
  mocks.list.mockImplementation(({ pageToken }) =>
    Promise.resolve({
      data: pageToken
        ? { files: [youtube] }
        : { files: [other], nextPageToken: "page-two" },
    }),
  );
  mocks.get.mockImplementation(({ fileId }) =>
    Promise.resolve({
      data: Readable.from([fileId === "other" ? otherZip : youtubeZip]),
    }),
  );
  expect(
    await downloadLatestArchive({
      afterExportCreatedAt: "2026-09-13T02:18:56.298Z",
    }),
  ).toBe(0);
  expect(mocks.list.mock.calls[1]?.[0].pageToken).toBe("page-two");
  expect(sidecar()).toMatchObject({
    driveFileId: youtube.id,
    sourceFile: youtube.name,
    exportCreatedAt: youtube.createdTime,
  });
  expect(sidecar().downloadedAt).not.toBe(youtube.createdTime);
  expect(
    fs
      .readdirSync(path.join(mocks.home, ".local/share/youtube-takeout"))
      .sort(),
  ).toEqual(["incoming", "watch-history.json", "watch-history.meta.json"]);
  expect(
    fs.readdirSync(
      path.join(mocks.home, ".local/share/youtube-takeout/incoming"),
    ),
  ).toEqual([]);
  expect(fs.existsSync(path.join(mocks.home, "credentials"))).toBe(false);
  expect(
    fs.readFileSync(
      path.join(mocks.home, ".local/share/youtube-takeout/watch-history.json"),
      "utf8",
    ),
  ).toBe('[{"title":"fixture"}]');
  mocks.get.mockClear();
  expect(
    await downloadLatestArchive({
      afterExportCreatedAt: sidecar().exportCreatedAt,
      excludeFileId: youtube.id,
    }),
  ).toBe(3);
  expect(mocks.get.mock.calls.map(([arg]) => arg.fileId)).toEqual(["other"]);
});

it("uses the archive filename if Drive creation time is missing, never the download time", async () => {
  const bytes = zip("Takeout/history/watch-history.json");
  mocks.list.mockResolvedValue({
    data: { files: [{ ...youtube, createdTime: null }] },
  });
  mocks.get.mockResolvedValue({ data: Readable.from([bytes]) });
  expect(await downloadLatestArchive()).toBe(0);
  expect(sidecar().exportCreatedAt).toBe("2026-09-28T05:59:45.000Z");
});

it("surfaces a corrupt archive instead of claiming it is not ready", async () => {
  mocks.list.mockResolvedValue({ data: { files: [youtube] } });
  mocks.get.mockResolvedValue({
    data: Readable.from([Buffer.from("broken zip")]),
  });
  await expect(downloadLatestArchive()).rejects.toThrow();
  expect(
    fs.existsSync(
      path.join(
        mocks.home,
        ".local/share/youtube-takeout/watch-history.meta.json",
      ),
    ),
  ).toBe(false);
});

it("surfaces Drive errors and rejects an invalid watermark before any Drive calls", async () => {
  mocks.list.mockRejectedValue(new Error("Drive unavailable"));
  await expect(downloadLatestArchive()).rejects.toThrow("Drive unavailable");
  mocks.list.mockClear();
  await expect(
    downloadLatestArchive({ afterExportCreatedAt: "invalid" }),
  ).rejects.toThrow("Invalid archive date");
  expect(mocks.list).not.toHaveBeenCalled();
});
