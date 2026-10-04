import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { RefreshState } from "./state";

const mocks = vi.hoisted(() => ({
  home: "",
  spawnSync:
    vi.fn<
      (
        cmd: string,
        args: string[],
      ) => { status: number; stdout: string; stderr: string }
    >(),
  execSync: vi.fn<(cmd: string) => string>(),
  spawn: vi.fn<() => never>(),
}));
vi.mock("os", async (importOriginal) => ({
  ...(await importOriginal<typeof os>()),
  homedir: () => mocks.home,
}));
vi.mock("child_process", () => ({
  spawnSync: mocks.spawnSync,
  execSync: mocks.execSync,
  spawn: mocks.spawn,
}));

const archive = {
  driveFileId: "fresh-youtube-archive",
  sourceFile: "takeout-20260928T055945Z-1-001.zip",
  exportCreatedAt: "2026-09-28T05:59:45.000Z",
  downloadedAt: "2026-10-01T12:00:00.000Z",
};
let stateFile: string;
let originalArgv: string[];

function readState() {
  return JSON.parse(fs.readFileSync(stateFile, "utf8")) as RefreshState;
}

async function tick() {
  vi.resetModules();
  await import("./refresh");
}

beforeEach(() => {
  vi.useFakeTimers();
  // Thursday: no export request window, and browser auth has expired.
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  mocks.home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-refresh-"));
  stateFile = path.join(
    mocks.home,
    ".hermes/workspace/state/youtube-takeout/state.json",
  );
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      state: "idle",
      requested_at: null,
      last_ingested_at: "2026-09-13T02:30:00.000Z",
      last_error: "google_auth_expired",
      consecutive_failures: 3,
    }),
  );
  originalArgv = process.argv;
  process.argv = ["node", "scripts/takeout/refresh.ts", "--no-browser"];
  process.exitCode = 0;
  mocks.spawnSync.mockReset().mockImplementation((_cmd, args: string[]) => {
    if (args.includes("scripts/takeout/request.ts")) {
      return { status: 1, stdout: "expired browser session", stderr: "" };
    }
    expect(args).toContain("scripts/takeout/download.ts");
    const watermark = args.indexOf("--after-export-created-at");
    if (watermark >= 0 && args[watermark + 1] === archive.exportCreatedAt) {
      return { status: 3, stdout: "No newer archive", stderr: "" };
    }
    const dataDir = path.join(mocks.home, ".local/share/youtube-takeout");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "watch-history.json"), "[]");
    fs.writeFileSync(
      path.join(dataDir, "watch-history.meta.json"),
      JSON.stringify(archive),
    );
    return { status: 0, stdout: "downloaded", stderr: "" };
  });
  mocks.execSync.mockReset().mockImplementation((cmd: string) =>
    cmd.includes("scripts/sync-youtube.ts")
      ? JSON.stringify({
          event: "youtube_sync_complete",
          status: "success",
          ...archive,
        })
      : "ok",
  );
  mocks.spawn.mockReset().mockImplementation(() => {
    throw new Error("Browser forbidden");
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(mocks.home, { recursive: true, force: true });
});

it("imports a fresh Drive archive while idle with expired browser auth, then does not ingest it again", async () => {
  await tick();
  expect(mocks.execSync.mock.calls.map(([cmd]) => cmd)).toEqual([
    "npx tsx scripts/sync-youtube.ts",
    "npx tsx scripts/classify-youtube.ts",
    "npx tsx scripts/score-youtube.ts --scope all --top-up --execute --activate",
  ]);
  expect(readState()).toMatchObject({ state: "idle", last_error: null });
  await tick();
  expect(mocks.execSync).toHaveBeenCalledTimes(3);
  expect(
    mocks.spawnSync.mock.calls.every(([, args]) =>
      args.includes("scripts/takeout/download.ts"),
    ),
  ).toBe(true);
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it.each(["2026-09-30T12:00:00.000Z", "2026-09-14T12:00:00.000Z"])(
  "discovers in requested state regardless of request timestamp %s",
  async (requestedAt) => {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        ...readState(),
        state: "requested",
        requested_at: requestedAt,
      }),
    );
    await tick();
    expect(mocks.execSync).toHaveBeenCalledTimes(3);
    expect(mocks.spawnSync.mock.calls[0]?.[1]).not.toContain("--requested-at");
    expect(readState()).toMatchObject({ state: "idle", requested_at: null });
  },
);

it.each(["2026-10-01T12:00:00Z", "2026-10-03T19:00:00Z"])(
  "discovers with ordinary cron argv on %s before touching expired browser auth",
  async (now) => {
    vi.setSystemTime(new Date(now));
    process.argv = originalArgv.slice(0, 2);
    await tick();
    expect(mocks.execSync).toHaveBeenCalledTimes(3);
    expect(
      mocks.spawnSync.mock.calls.every(([, args]) =>
        args.includes("scripts/takeout/download.ts"),
      ),
    ).toBe(true);
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);

it("discovers even when the last ingestion is too recent for a request", async () => {
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      ...readState(),
      last_ingested_at: "2026-09-30T12:00:00Z",
    }),
  );
  await tick();
  expect(mocks.execSync).toHaveBeenCalledTimes(3);
});

it("never requests or launches a browser in --no-browser mode on a weekend with no archive", async () => {
  vi.setSystemTime(new Date("2026-10-03T19:00:00Z"));
  mocks.spawnSync.mockReturnValue({ status: 3, stdout: "", stderr: "" });
  await tick();
  expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
  expect(mocks.execSync).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(0);
});

it("stages only in --download-only mode, without acknowledging ingestion", async () => {
  vi.setSystemTime(new Date("2026-10-03T19:00:00Z"));
  process.argv = ["node", "scripts/takeout/refresh.ts", "--download-only"];
  const previous = readState();
  await tick();
  expect(mocks.execSync).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(readState().last_ingested_at).toBe(previous.last_ingested_at);
  expect(readState().last_ingested_archive).toBeUndefined();
  expect(
    fs.existsSync(
      path.join(
        mocks.home,
        ".local/share/youtube-takeout/watch-history.meta.json",
      ),
    ),
  ).toBe(true);
  process.argv = ["node", "scripts/takeout/refresh.ts", "--no-browser"];
  await tick();
  expect(mocks.execSync).toHaveBeenCalledTimes(3);
});

it.each(["throw", "failed-result", "missing-result", "wrong-archive"])(
  "does not advance watermark on sync %s; retries the same archive",
  async (failure) => {
    const success = mocks.execSync.getMockImplementation()!;
    mocks.execSync.mockImplementationOnce(() => {
      if (failure === "throw") throw new Error("sync failed");
      if (failure === "missing-result") return "finished";
      return JSON.stringify({
        event: "youtube_sync_complete",
        ...archive,
        status: failure === "failed-result" ? "failed" : "success",
        ...(failure === "wrong-archive"
          ? { exportCreatedAt: "2026-10-01T12:00:00Z" }
          : {}),
      });
    });
    const previous = readState();
    await tick();
    expect(process.exitCode).toBe(1);
    expect(readState()).toMatchObject({
      last_error: "sync_failed",
      last_ingested_at: previous.last_ingested_at,
    });
    expect(readState().last_ingested_archive).toBeUndefined();
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
    process.exitCode = 0;
    mocks.execSync.mockImplementation(success);
    await tick();
    expect(readState().last_ingested_archive).toEqual(archive);
    expect(process.exitCode).toBe(0);
  },
);

it.each(["classify", "score"])(
  "reports %s failure and retries enrichment without duplicate ingestion",
  async (stage) => {
    const success = mocks.execSync.getMockImplementation()!;
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes(`scripts/${stage}-youtube.ts`))
        throw new Error("stage failed");
      return success(cmd);
    });
    await tick();
    expect(process.exitCode).toBe(1);
    expect(readState()).toMatchObject({
      enrichment_pending: true,
      last_error: `${stage}_failed`,
      last_ingested_archive: archive,
    });
    expect(
      vi
        .mocked(console.log)
        .mock.calls.some(
          ([line]) =>
            (JSON.parse(String(line)) as { event: string }).event ===
            "refresh_complete",
        ),
    ).toBe(false);
    mocks.execSync.mockImplementation(success);
    process.exitCode = 0;
    await tick();
    expect(
      mocks.execSync.mock.calls.filter(([cmd]) =>
        cmd.includes("scripts/sync-youtube.ts"),
      ),
    ).toHaveLength(1);
    expect(readState()).toMatchObject({
      enrichment_pending: false,
      last_error: null,
    });
    expect(process.exitCode).toBe(0);
  },
);

it.each([1, 2])(
  "surfaces download failure %s without sync or browser activity",
  async (status) => {
    mocks.spawnSync.mockReturnValue({
      status,
      stdout: "",
      stderr: "sensitive error omitted",
    });
    await tick();
    expect(process.exitCode).toBe(1);
    expect(mocks.execSync).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);

it("uses the legacy successful sidecar as a watermark, never last_ingested_at", async () => {
  const dataDir = path.join(mocks.home, ".local/share/youtube-takeout");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "watch-history.meta.json"),
    JSON.stringify({
      ...archive,
      downloadedAt: "2026-09-28T07:00:00Z",
    }),
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      ...readState(),
      last_ingested_at: "2026-09-29T12:00:00Z",
    }),
  );
  await tick();
  expect(mocks.spawnSync.mock.calls[0]?.[1]).toContain(archive.exportCreatedAt);
  expect(mocks.execSync).not.toHaveBeenCalled();
});

it("keeps the future weekend request policy after discovery finds nothing", async () => {
  vi.setSystemTime(new Date("2026-10-03T19:00:00Z"));
  process.argv = originalArgv.slice(0, 2);
  mocks.spawnSync.mockReturnValueOnce({ status: 3, stdout: "", stderr: "" });
  await tick();
  expect(mocks.spawnSync.mock.calls[1]?.[1]).toContain(
    "scripts/takeout/request.ts",
  );
  expect(readState().last_error).toBe("google_auth_expired");
  expect(process.exitCode).toBe(0);
});

it("refuses overlapping ticks at the shared runtime lock before reading/writing state", async () => {
  const lockPath = path.join(path.dirname(stateFile), "refresh.lock");
  fs.mkdirSync(lockPath);
  const before = fs.readFileSync(stateFile, "utf8");
  await tick();
  expect(process.exitCode).toBe(1);
  expect(mocks.spawnSync).not.toHaveBeenCalled();
  expect(mocks.execSync).not.toHaveBeenCalled();
  expect(fs.readFileSync(stateFile, "utf8")).toBe(before);
  expect(fs.existsSync(lockPath)).toBe(true);
});

it("releases the lock on unexpected failure so the next tick can retry", async () => {
  mocks.spawnSync.mockImplementationOnce(() => {
    throw new Error("unexpected failure");
  });
  await tick();
  expect(process.exitCode).toBe(1);
  expect(
    fs.existsSync(path.join(path.dirname(stateFile), "refresh.lock")),
  ).toBe(false);
  process.exitCode = 0;
  await tick();
  expect(mocks.execSync).toHaveBeenCalledTimes(3);
  expect(process.exitCode).toBe(0);
});

it("keeps Drive discovery alive after repeated browser-auth failures", async () => {
  vi.setSystemTime(new Date("2026-10-03T19:00:00Z"));
  process.argv = originalArgv.slice(0, 2);
  const availableArchive = mocks.spawnSync.getMockImplementation()!;
  mocks.spawnSync.mockImplementation((_cmd, args: string[]) => ({
    status: args.includes("scripts/takeout/request.ts") ? 1 : 3,
    stdout: "",
    stderr: "",
  }));
  for (let i = 0; i < 3; i++) {
    await tick();
    expect(process.exitCode).toBe(0);
    expect(readState().last_error).toBe("google_auth_expired");
  }
  expect(
    vi
      .mocked(console.log)
      .mock.calls.filter(
        ([line]) =>
          (JSON.parse(String(line)) as { event: string }).event ===
          "requested_auth_failure",
      ),
  ).toHaveLength(3);
  mocks.spawnSync.mockImplementation(availableArchive);
  await tick();
  expect(mocks.execSync).toHaveBeenCalledTimes(3);
  expect(readState()).toMatchObject({
    last_error: null,
    last_ingested_archive: archive,
  });
  expect(mocks.spawn).not.toHaveBeenCalled();
});
