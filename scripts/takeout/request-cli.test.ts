/**
 * The CLI surface of the request path: which exit code each outcome produces,
 * what refuses to run, and what it is allowed to touch.
 *
 * Every browser call is mocked. Nothing here launches Chromium, opens a window,
 * reaches Google, or runs the importer — the tests assert that too.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowOutcome } from "./request-flow";
import {
  type RequestState,
  blankRequestState,
  recordAwaitingAuth,
  recordBlocked,
  recordFormFilled,
  recordSubmitted,
  startAttempt,
  writeRequestState,
} from "./request-state";
import type { SessionRecord } from "./session";

const mocks = vi.hoisted(() => ({
  hasCookies: vi.fn(() => true),
  getPage: vi.fn(async () => ({ page: true })),
  close: vi.fn(async () => undefined),
  runRequestAttempt: vi.fn<() => Promise<FlowOutcome>>(),
  fillExportForm: vi.fn(),
  clickCreateExport: vi.fn(),
  observeManageQueue: vi.fn(),
  detectAuthGate: vi.fn(),
  formReady: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("dotenv/config", () => ({}));
vi.mock("./browser", () => ({
  hasGoogleSessionCookies: mocks.hasCookies,
  getPage: mocks.getPage,
  close: mocks.close,
  getContext: vi.fn(),
  getProfileDir: () => "/tmp/profile",
}));
vi.mock("./flow", () => ({
  fillExportForm: mocks.fillExportForm,
  clickCreateExport: mocks.clickCreateExport,
  AUTH_GATE_RE: /accounts\.google\.com/,
  TAKEOUT_URL: "https://takeout.google.com/",
  snap: vi.fn(),
  verifyExportQueued: vi.fn(),
}));
vi.mock("./takeout-dom", () => ({
  observeManageQueue: mocks.observeManageQueue,
  detectAuthGate: mocks.detectAuthGate,
  formReady: mocks.formReady,
  isTakeoutUrl: () => true,
  clickTryAnotherWay: vi.fn(),
  chooseEnterPassword: vi.fn(),
  passwordFieldVisible: vi.fn(),
  MANAGE_URL: "https://takeout.google.com/manage",
}));
vi.mock("./request-flow", () => ({ runRequestAttempt: mocks.runRequestAttempt }));
vi.mock("child_process", () => ({
  spawn: mocks.spawn,
  spawnSync: mocks.spawnSync,
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

let home: string;
let stateDir: string;
let originalArgv: string[];

function emitted(): Record<string, unknown>[] {
  return vi
    .mocked(console.log)
    .mock.calls.flatMap(([line]) => {
      try {
        return [JSON.parse(String(line)) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

function session(overrides: Partial<SessionRecord> = {}): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "request-session.json"),
    JSON.stringify({
      schema: 1,
      pid: process.pid,
      started_at: "2026-10-04T18:00:00.000Z",
      mode: "headed",
      attempt_id: "attempt-1",
      host: os.hostname(),
      ...overrides,
    }),
  );
}

/** The live record of 2026-10-06: clicked, bounced to a passkey, never verified. */
function writeBouncedState(attemptId: string): void {
  const at = new Date("2026-10-06T05:05:03.247Z");
  const submitted = recordSubmitted(
    recordFormFilled(
      startAttempt(blankRequestState(), { now: at, attemptId, pendingBefore: [] }),
      { now: at },
    ),
    { now: at },
  );
  writeRequestState(
    recordBlocked(
      recordAwaitingAuth(submitted, { now: at, step: "passkey", blocker: "passkey_tap_required" }),
      { now: at, reason: "credential_route_unavailable" },
    ),
  );
}

/** Calls the real entry point. Importing it does not run it. */
function writeQueuedState(queuedAt: string, attemptId = "a1"): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "request-state.json"),
    JSON.stringify({
      schema: 1,
      phase: "queued",
      attempt: {
        attempt_id: attemptId,
        started_at: "2026-10-04T17:00:00.000Z",
        form_filled_at: "2026-10-04T17:01:00.000Z",
        submitted_at: "2026-10-04T17:02:00.000Z",
        pending_before: [],
      },
      awaiting_auth_since: null,
      auth_step: null,
      blocker: null,
      queued_at: queuedAt,
      queue_evidence: {
        source: "takeout_manage_queue",
        exportId: "export-new",
        createdAtText: null,
        observedAt: queuedAt,
      },
      last_error: null,
      consecutive_failures: 0,
      last_queue_observation: null,
      updated_at: queuedAt,
      host: os.hostname(),
    }),
  );
}

/**
 * Calls the real entry point once. `argv[1]` is the test runner, not the
 * module, so the entry guard keeps the import itself from running anything.
 */
async function runRequestCli(): Promise<void> {
  vi.resetModules();
  const entry = (await import("./request")) as {
    main: () => Promise<number>;
    done: Promise<void>;
  };
  await entry.done;
  expect(mocks.getPage).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
  process.exitCode = await entry.main();
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-request-cli-"));
  stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", stateDir);
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, ".local/share/yt"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
  originalArgv = process.argv;
  process.argv = ["node", "vitest", ...[]];
  process.exitCode = 0;
  mocks.hasCookies.mockReset().mockReturnValue(true);
  mocks.getPage.mockReset().mockResolvedValue({ page: true });
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.runRequestAttempt.mockReset();
  mocks.spawn.mockReset().mockReturnValue({ unref: vi.fn() });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = 0;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("request.ts exit codes", () => {
  it.each([
    [{ kind: "queued", evidence: null }, 0],
    [{ kind: "awaiting_auth", step: "passkey", blocker: null }, 4],
    [{ kind: "submission_unverified", reason: "no_in_progress_export" }, 5],
    [{ kind: "queue_unobserved", reason: "auth_gate" }, 5],
    [{ kind: "already_queued", reason: "within_cycle" }, 3],
    [{ kind: "pending_export_exists", exportIds: [] }, 3],
    [{ kind: "deferred", reason: "foreign_host" }, 3],
    [{ kind: "blocked", reason: "submission_uncertain" }, 2],
    [{ kind: "failed", error: "ui_failure" }, 2],
  ] as [FlowOutcome, number][])(
    "maps %o to exit %i",
    async (outcome, code) => {
      mocks.runRequestAttempt.mockResolvedValue(outcome);
      await runRequestCli();
      expect(process.exitCode).toBe(code);
      expect(emitted()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: "request_outcome" }),
        ]),
      );
    },
  );

  it("records the missing session and exits 1 without opening a page", async () => {
    mocks.hasCookies.mockReturnValue(false);
    await runRequestCli();
    expect(process.exitCode).toBe(1);
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(mocks.runRequestAttempt).not.toHaveBeenCalled();
    const state = JSON.parse(
      fs.readFileSync(path.join(stateDir, "request-state.json"), "utf8"),
    ) as RequestState;
    expect(state).toMatchObject({
      phase: "failed",
      last_error: "session_cookies_missing",
    });
  });

  it.each([
    ["--debug", "retired_argument"],
    ["--timeout", "retired_argument"],
    ["--no-headed", "retired_argument"],
    ["--headed", "unknown_argument"],
  ])("refuses %s before touching anything", async (argument, reason) => {
    process.argv = ["node", "vitest", argument];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runRequestCli();
    expect(process.exitCode).toBe(2);
    expect(mocks.hasCookies).not.toHaveBeenCalled();
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(fs.existsSync(stateDir)).toBe(false);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "request_invalid_arguments",
          reason,
        }),
      ]),
    );
  });

  it("answers --help without reading cookies or state", async () => {
    process.argv = ["node", "vitest", "--help"];
    await runRequestCli();
    expect(process.exitCode).toBe(0);
    expect(mocks.hasCookies).not.toHaveBeenCalled();
    expect(fs.existsSync(stateDir)).toBe(false);
  });

  it("fails closed on a record it cannot parse, without overwriting it", async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const raw = JSON.stringify({ schema: 1, phase: "queued" });
    fs.writeFileSync(path.join(stateDir, "request-state.json"), raw);
    await runRequestCli();
    expect(process.exitCode).toBe(2);
    expect(mocks.hasCookies).not.toHaveBeenCalled();
    expect(mocks.runRequestAttempt).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(path.join(stateDir, "request-state.json"), "utf8"),
    ).toBe(raw);
  });

  it("does not write a failure over a record it cannot parse", async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const raw = "{ truncated";
    fs.writeFileSync(path.join(stateDir, "request-state.json"), raw);
    mocks.hasCookies.mockReturnValue(false);
    await runRequestCli();
    expect(process.exitCode).toBe(2);
    expect(
      fs.readFileSync(path.join(stateDir, "request-state.json"), "utf8"),
    ).toBe(raw);
  });

  it("reads the session only after taking the mutex", async () => {
    // A view taken before the lock could be stale by the time it is acted on.
    fs.mkdirSync(path.join(stateDir, "request.lock"), { recursive: true });
    session();
    await runRequestCli();
    expect(process.exitCode).toBe(5);
    expect(mocks.hasCookies).not.toHaveBeenCalled();
  });

  it("stands down on a session record it cannot read", async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "request-session.json"), "{ truncated");
    await runRequestCli();
    expect(process.exitCode).toBe(3);
    expect(mocks.getPage).not.toHaveBeenCalled();
  });

  it("stands down while a headed window owns the flow", async () => {
    session();
    await runRequestCli();
    expect(process.exitCode).toBe(3);
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(mocks.runRequestAttempt).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "request_session_busy" }),
      ]),
    );
  });

  it("refuses to run twice at once", async () => {
    fs.mkdirSync(path.join(stateDir, "request.lock"), { recursive: true });
    await runRequestCli();
    expect(process.exitCode).toBe(5);
    expect(mocks.runRequestAttempt).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "request_lock_busy" }),
      ]),
    );
  });

  it("releases the mutex even when the attempt throws", async () => {
    mocks.runRequestAttempt.mockRejectedValue(new Error("boom"));
    await runRequestCli();
    expect(process.exitCode).toBe(2);
    expect(fs.existsSync(path.join(stateDir, "request.lock"))).toBe(false);
    expect(mocks.close).toHaveBeenCalled();
    // The reason is a name, never the message or any page content.
    expect(emitted()).toEqual(
      expect.arrayContaining([
        { event: "request_crashed", reason: "Error" },
      ]),
    );
  });

  it("reports what the recorded state allows without touching the browser", async () => {
    process.argv = ["node", "vitest", "--dry-run"];
    await runRequestCli();
    expect(process.exitCode).toBe(0);
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(mocks.runRequestAttempt).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "request_dry_run", present: false }),
      ]),
    );
  });

  it("never writes the importer's state or runs the importer", async () => {
    mocks.runRequestAttempt.mockResolvedValue({
      kind: "queued",
      evidence: {
        source: "takeout_manage_queue",
        exportId: "export-new",
        createdAtText: null,
        observedAt: "2026-10-04T18:00:00.000Z",
      },
    });
    await runRequestCli();
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

describe("approve.ts", () => {
  /**
   * Runs the real watch loop with a millisecond poll interval, so the lifecycle
   * is exercised in order rather than raced against a clock.
   */
  async function runApprove(argv: string[] = []): Promise<void> {
    process.argv = ["node", "vitest", "--poll", "0.002", ...argv];
    vi.resetModules();
    const entry = (await import("./approve")) as {
      main: () => Promise<number>;
      done: Promise<void>;
    };
    await entry.done;
    expect(mocks.spawn).not.toHaveBeenCalled();
    process.exitCode = await entry.main();
  }

  it("refuses a retired flag before spawning anything", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runApprove(["--then-ingest"]);
    expect(process.exitCode).toBe(2);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.hasCookies).not.toHaveBeenCalled();
  });

  it("has no way to run the importer at all", async () => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, "approve.ts"),
      "utf8",
    );
    expect(source).not.toContain("refresh.ts");
    expect(source).not.toContain("ingestNow");
  });

  it("reports an export queued earlier as history, not as acceptance", async () => {
    const queuedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    writeQueuedState(queuedAt);
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(3);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "approve_already_queued",
          queued_at: queuedAt,
        }),
      ]),
    );
    expect(emitted().map((record) => record.event)).not.toContain(
      "approve_queued",
    );
  });

  it("asks again once last cycle's export has aged out", async () => {
    // Before, any `queued` record refused forever, so the second week of use
    // could never request anything.
    writeQueuedState(new Date(Date.now() - 10 * 24 * 3600_000).toISOString(), "a1");
    mocks.spawn.mockImplementation(() => {
      session();
      setTimeout(() => writeQueuedState(new Date().toISOString(), "a2"), 20);
      return { unref: vi.fn() };
    });
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(0);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const queued = emitted().filter((record) => record.event === "approve_queued");
    // The old record is never reported as this run's acceptance.
    expect(queued).toEqual([expect.objectContaining({ attempt_id: "a2", fresh: true })]);
  });

  it("calls an aged export history when the window finds it still building", async () => {
    writeQueuedState(new Date(Date.now() - 10 * 24 * 3600_000).toISOString(), "a1");
    mocks.spawn.mockImplementation(() => {
      session();
      // The window looks, sees the export still building, and ends.
      setTimeout(() => fs.rmSync(path.join(stateDir, "request-session.json"), { force: true }), 20);
      return { unref: vi.fn() };
    });
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(3);
    const events = emitted().map((record) => record.event);
    expect(events).toContain("approve_already_queued");
    expect(events).not.toContain("approve_queued");
  });

  it("says so plainly when the window never opened", async () => {
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(2);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "approve_window_not_started" }),
      ]),
    );
    expect(emitted().map((record) => record.event)).not.toContain(
      "approve_still_waiting",
    );
  });

  it("does not claim the window is open once the holder has gone", async () => {
    session();
    // The holder's record disappears while this is watching.
    const sessionFile = path.join(stateDir, "request-session.json");
    setTimeout(() => fs.rmSync(sessionFile, { force: true }), 5);
    await runApprove(["--wait", "0.002"]);
    expect(process.exitCode).toBe(2);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "approve_window_gone" }),
      ]),
    );
  });

  it("asks for a detached window rather than owning one", async () => {
    await runApprove(["--wait", "1"]);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [, args, options] = mocks.spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { detached: boolean; stdio: unknown[] },
    ];
    expect(args).toContain("scripts/takeout/session-host.ts");
    expect(args).toContain("--deadline");
    expect(args).not.toContain("--retry-unconfirmed");
    expect(options.detached).toBe(true);
    // It must not open a browser itself; the host owns the window.
    expect(mocks.getPage).not.toHaveBeenCalled();
  });

  it("gives the window's output a file to go to, instead of discarding it", async () => {
    await runApprove(["--wait", "1"]);
    const [, , options] = mocks.spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { stdio: unknown[] },
    ];
    expect(options.stdio[0]).toBe("ignore");
    expect(typeof options.stdio[1]).toBe("number");
    expect(options.stdio[2]).toBe(options.stdio[1]);
    expect(fs.existsSync(path.join(stateDir, "request-session.log"))).toBe(true);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "approve_window_requested",
          log: path.join(stateDir, "request-session.log"),
        }),
      ]),
    );
  });

  it("passes a retry for the attempt on record to the new window", async () => {
    writeBouncedState("a1");
    await runApprove(["--retry-unconfirmed", "a1", "--wait", "1"]);
    const [, args] = mocks.spawn.mock.calls[0] as unknown as [string, string[]];
    expect(args.slice(-2)).toEqual(["--retry-unconfirmed", "a1"]);
  });

  it("refuses a retry for an attempt that is not on record, opening nothing", async () => {
    writeBouncedState("a1");
    await runApprove(["--retry-unconfirmed", "a-typo", "--wait", "1"]);
    expect(process.exitCode).toBe(2);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "approve_retry_refused", reason: "no_such_attempt" }),
      ]),
    );
  });

  it("refuses a retry while a window is open, without asking it to resume", async () => {
    writeBouncedState("a1");
    session();
    await runApprove(["--retry-unconfirmed", "a1", "--wait", "1"]);
    expect(process.exitCode).toBe(3);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(stateDir, "request-session.resume"))).toBe(false);
  });

  it("does not report the abandoned attempt's blocker as this run's result", async () => {
    writeBouncedState("a1");
    // The window appears, and later queues a new attempt.
    mocks.spawn.mockImplementation(() => {
      session();
      setTimeout(() => writeQueuedState("2026-10-07T18:30:00.000Z", "a2"), 20);
      return { unref: vi.fn() };
    });
    await runApprove(["--retry-unconfirmed", "a1", "--wait", "1"]);
    expect(process.exitCode).toBe(0);
    const events = emitted().map((record) => record.event);
    expect(events).not.toContain("approve_blocked");
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "approve_queued", attempt_id: "a2", fresh: true }),
      ]),
    );
  });

  it("does not ask a window it is not attached to for anything", async () => {
    await runApprove(["--no-launch"]);
    expect(process.exitCode).toBe(3);
    expect(
      fs.existsSync(path.join(stateDir, "request-session.resume")),
    ).toBe(false);
  });

  it("says the window is still open when it stops watching", async () => {
    session();
    await runApprove(["--wait", "0.002"]);
    expect(process.exitCode).toBe(4);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "approve_still_waiting",
          window_open_until_min: 360,
        }),
      ]),
    );
  });

  it("watches an existing window instead of starting a second", async () => {
    session();
    await runApprove(["--wait", "0.002"]);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "approve_watching_existing_window",
          resume_requested: true,
        }),
      ]),
    );
    // Attaching asks the holder to carry on in the window it already owns.
    expect(
      fs.existsSync(path.join(stateDir, "request-session.resume")),
    ).toBe(true);
  });

  it("stands down rather than open a window beside another host's", async () => {
    session({ host: "other-mac.local" });
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(3);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does nothing at all with --no-launch and no session", async () => {
    await runApprove(["--no-launch"]);
    expect(process.exitCode).toBe(3);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("reports a fresh acceptance from an attempt that queued while watching", async () => {
    session();
    // Nothing queued yet when watching starts; the holder queues one next poll.
    setTimeout(() => writeQueuedState("2026-10-04T18:30:00.000Z", "a2"), 5);
    await runApprove(["--wait", "1"]);
    expect(process.exitCode).toBe(0);
    expect(emitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "approve_queued",
          attempt_id: "a2",
          fresh: true,
          queued_at: "2026-10-04T18:30:00.000Z",
        }),
      ]),
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
