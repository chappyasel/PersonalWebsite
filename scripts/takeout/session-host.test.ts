/**
 * Lifecycle tests for the approval window's owner.
 *
 * These use the real `runApprovalSession`, the real per-attempt mutex, the real
 * request state machine and real files on disk. What is substituted is the
 * browser: pages are fixtures, so nothing opens a window, reaches Google, or
 * runs the importer. The point of each test is a rule the old approval path
 * broke — chiefly that no timeout and no blocker may close the window.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ManageExportObservation,
  manageQueueObservation,
  unknownObservation,
} from "./queue-evidence";
import type { RequestFlowDeps } from "./request-flow";
import { blankRequestState, readRequestState, writeRequestState } from "./request-state";
import {
  type ApprovalSessionDeps,
  nativeRouteHook,
  runApprovalSession,
} from "./session-host";
import { acquireNamedLock } from "./lock";

let home: string;
let stateDir: string;
let clock: Date;

const page = { fixture: "page" };

function card(
  overrides: Partial<ManageExportObservation> = {},
): ManageExportObservation {
  return {
    exportId: "export-new",
    status: "in_progress",
    products: ["youtube and youtube music"],
    createdAtText: "Oct 4, 2026",
    ...overrides,
  };
}

type Harness = {
  options: ApprovalSessionDeps;
  calls: string[];
  askResume: () => void;
  closed: () => boolean;
  waits: number[];
  setReleased: (value: boolean) => void;
  setWindowClosed: (value: boolean) => void;
  resumes: number;
  windows: number;
};

function harness(options: {
  queue?: ManageExportObservation[][];
  authGate?: RequestFlowDeps["detectAuthGate"];
  deadlineAt?: number;
  resumeWindowMs?: number;
  onAuthWait?: ApprovalSessionDeps["onAuthWait"];
  maxWaits?: number;
} = {}): Harness {
  const calls: string[] = [];
  const waits: number[] = [];
  const queues = options.queue ?? [[]];
  let observation = 0;
  let released = false;
  let windowClosed = false;
  let resumeAsked = false;
  let resumes = 0;
  const pagesHandedOut = new Set<unknown>();
  const maxWaits = options.maxWaits ?? 4;

  const deps: RequestFlowDeps = {
    now: () => clock,
    newAttemptId: () => "attempt-host",
    loadState: () => readRequestState(),
    saveState: writeRequestState,
    // The holder owns a live window and says so, so an aged-out wait cannot
    // reset into a brand new attempt.
    sessionView: () => ({
      kind: "alive",
      record: {
        schema: 1,
        pid: process.pid,
        started_at: "2026-10-04T18:00:00.000Z",
        mode: "headed",
        attempt_id: "attempt-host",
        host: os.hostname(),
      },
    }),
    openPage: async (request) => {
      // A holder owns one window. `attach: false` would mean "launch another".
      calls.push(`openPage:${request.attach ? "attach" : "launch"}`);
      pagesHandedOut.add(page);
      return page;
    },
    fillForm: async () => {
      calls.push("fillForm");
    },
    clickCreateExport: async () => {
      calls.push("clickCreateExport");
    },
    observeQueue: async () => {
      calls.push("observeQueue");
      const exports = queues[Math.min(observation, queues.length - 1)] ?? [];
      observation += 1;
      return manageQueueObservation(exports, clock.toISOString());
    },
    detectAuthGate: async (target) => {
      calls.push("detectAuthGate");
      return options.authGate ? await options.authGate(target) : null;
    },
    formReady: async () => {
      calls.push("formReady");
      return false;
    },
  };

  const askResume = () => {
    resumeAsked = true;
  };

  return {
    calls,
    waits,
    askResume,
    get resumes() {
      return resumes;
    },
    get windows() {
      return pagesHandedOut.size;
    },
    closed: () => windowClosed,
    setReleased: (value) => {
      released = value;
    },
    setWindowClosed: (value) => {
      windowClosed = value;
    },
    options: {
      deps,
      pollMs: 1,
      deadlineAt: options.deadlineAt ?? Number.MAX_SAFE_INTEGER,
      now: () => clock.getTime(),
      wait: async (ms) => {
        waits.push(ms);
        // Stop an endless hold from hanging the test; a real holder waits for a
        // person, which is the behaviour under test.
        if (waits.length >= maxWaits) released = true;
      },
      windowClosed: () => windowClosed,
      released: () => released,
      resumeWindowMs: options.resumeWindowMs ?? 60_000,
      resumeRequested: () => resumeAsked,
      consumeResume: () => {
        resumeAsked = false;
        resumes += 1;
      },
      onAuthWait: options.onAuthWait,
    },
  };
}

beforeEach(() => {
  clock = new Date("2026-10-04T18:00:00.000Z");
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-host-"));
  stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", stateDir);
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, ".local/share/yt"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("runApprovalSession", () => {
  it("stops as soon as an export is confirmed queued", async () => {
    const h = harness({ queue: [[], [card()]] });
    await expect(runApprovalSession(h.options)).resolves.toEqual({
      code: 0,
      reason: "queued",
    });
    expect(readRequestState().state).toMatchObject({ phase: "queued" });
    // One pass: it did not keep polling after success.
    expect(h.calls.filter((call) => call === "clickCreateExport")).toHaveLength(1);
    expect(h.calls).not.toContain("openPage:launch");
    expect(h.waits).toEqual([]);
  });

  it("holds the window open when the deadline passes, instead of ending", async () => {
    // Deadline already behind us. The session must keep waiting for a person;
    // returning here is what used to take the window away mid-passkey.
    const h = harness({ deadlineAt: clock.getTime() - 1, maxWaits: 2 });
    const result = await runApprovalSession(h.options);
    // It only ended because the harness released it after two waits.
    expect(h.waits.length).toBeGreaterThanOrEqual(2);
    expect(result).toEqual({ code: 4, reason: "released" });
    // And nothing was driven while holding: no form, no submission.
    expect(h.calls).toEqual([]);
    expect(h.closed()).toBe(false);
  });

  it("holds indefinitely past the deadline until something releases it", async () => {
    const h = harness({ deadlineAt: clock.getTime() - 1, maxWaits: 25 });
    await runApprovalSession(h.options);
    // Twenty-five waits deep and still holding; nothing but a release ends it.
    expect(h.waits.length).toBe(25);
    expect(h.calls).toEqual([]);
  });

  it("holds the window open on a blocker instead of closing it", async () => {
    const h = harness({
      queue: [[]],
      authGate: async () => ({
        step: "password",
        blocker: "credential_route_unavailable",
      }),
      maxWaits: 3,
    });
    const result = await runApprovalSession(h.options);
    expect(result.code).toBe(4);
    expect(result.reason).toBe("released");
    // It kept waiting rather than ending on the blocker.
    expect(h.waits.length).toBeGreaterThan(0);
    // The attempt parked rather than failing, and the window stayed.
    expect(readRequestState().state).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "password",
      blocker: "credential_route_unavailable",
    });
    expect(h.closed()).toBe(false);
  });

  it("keeps waiting while an auth gate is up, polling without resubmitting", async () => {
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
      maxWaits: 3,
    });
    await runApprovalSession(h.options);
    expect(h.calls.filter((call) => call === "clickCreateExport")).toHaveLength(0);
    expect(h.waits.length).toBeGreaterThan(1);
    expect(readRequestState().state?.phase).toBe("awaiting_auth");
  });

  it("completes the first submission once a person clears the gate", async () => {
    let gated = true;
    const h = harness({
      queue: [[], [], [card()]],
      authGate: async () =>
        gated ? { step: "passkey", blocker: "passkey_tap_required" } : null,
      maxWaits: 8,
    });
    // The person signs in between polls.
    const original = h.options.wait;
    h.options.wait = async (ms) => {
      gated = false;
      await original(ms);
    };
    await expect(runApprovalSession(h.options)).resolves.toMatchObject({
      code: 0,
      reason: "queued",
    });
    expect(h.calls.filter((call) => call === "fillForm")).toHaveLength(1);
    expect(h.calls.filter((call) => call === "clickCreateExport")).toHaveLength(1);
    expect(readRequestState().state).toMatchObject({
      phase: "queued",
      attempt: { attempt_id: "attempt-host" },
    });
  });

  it("ends when the person closes the window themselves", async () => {
    const h = harness({ queue: [[]] });
    h.setWindowClosed(true);
    await expect(runApprovalSession(h.options)).resolves.toEqual({
      code: 4,
      reason: "window_closed",
    });
    expect(h.calls).toEqual([]);
  });

  it("ends on an explicit release, without having driven anything", async () => {
    const h = harness({ queue: [[]] });
    h.setReleased(true);
    await expect(runApprovalSession(h.options)).resolves.toEqual({
      code: 4,
      reason: "released",
    });
    expect(h.calls).toEqual([]);
  });

  it("gives up its turn when the per-attempt mutex is held elsewhere", async () => {
    const release = acquireNamedLock("request.lock");
    try {
      const h = harness({ queue: [[card()]], maxWaits: 2 });
      await runApprovalSession(h.options);
      // It waited instead of driving the form behind another run's back.
      expect(h.calls).toEqual([]);
      expect(h.waits.length).toBeGreaterThan(0);
    } finally {
      release();
    }
  });

  it("releases the mutex after each attempt, not for the window's life", async () => {
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
      maxWaits: 2,
    });
    await runApprovalSession(h.options);
    // The scheduled headless path must still be able to take the lock.
    const release = acquireNamedLock("request.lock");
    release();
  });

  it("stops when there is already an export building, without claiming it", async () => {
    const h = harness({ queue: [[card({ exportId: "export-old" })]] });
    await expect(runApprovalSession(h.options)).resolves.toEqual({
      code: 3,
      reason: "complete",
    });
    expect(readRequestState().state?.phase).toBe("idle");
    expect(readRequestState().state?.queue_evidence).toBeNull();
  });

  it("holds rather than closing when the queue cannot be read", async () => {
    const h = harness({ maxWaits: 3 });
    h.options.deps.observeQueue = async () => {
      h.calls.push("observeQueue");
      return unknownObservation("unreadable", clock.toISOString());
    };
    const result = await runApprovalSession(h.options);
    expect(result.code).toBe(4);
    expect(h.waits.length).toBeGreaterThan(0);
    expect(h.closed()).toBe(false);
    expect(readRequestState().present).toBe(false);
  });

  it("runs the opted-in native route at the passkey gate, where the dialog is", async () => {
    const route = vi.fn(async () => "credential_route_unavailable" as const);
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
      onAuthWait: nativeRouteHook(route),
      maxWaits: 2,
    });
    await runApprovalSession(h.options);
    expect(route).toHaveBeenCalled();
  });

  it("runs the native route once per holder, not on every poll", async () => {
    // Live, 2026-10-05: at a 3-second poll the route clicked "Try another way"
    // three times while the page was meant to be waiting for a person.
    const route = vi.fn(async () => null);
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
      onAuthWait: nativeRouteHook(route),
      maxWaits: 5,
    });
    await runApprovalSession(h.options);
    expect(h.waits.length).toBeGreaterThan(2);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("leaves a visible password prompt alone for the person to type into", async () => {
    const route = vi.fn(async () => null);
    const h = harness({
      queue: [[]],
      authGate: async () => ({
        step: "password",
        blocker: "credential_route_unavailable",
      }),
      onAuthWait: nativeRouteHook(route),
      maxWaits: 2,
    });
    await runApprovalSession(h.options);
    expect(route).not.toHaveBeenCalled();
  });

  it("does nothing automatic at the passkey gate when the adapter is off", async () => {
    // No passwordRoute at all: the manual tap stays the default path, and the
    // attempt is parked rather than blocked on an unavailable adapter.
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
      maxWaits: 2,
    });
    await runApprovalSession(h.options);
    expect(readRequestState().state).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "passkey",
      blocker: "passkey_tap_required",
    });
  });

  it("carries on in the same window when a resume is asked for", async () => {
    let gated = true;
    const h = harness({
      queue: [[], [], [card()]],
      authGate: async () =>
        gated ? { step: "passkey", blocker: "passkey_tap_required" } : null,
      // Already past the deadline, so it holds on the first pass.
      deadlineAt: 0,
      maxWaits: 12,
    });
    const original = h.options.wait;
    let waits = 0;
    h.options.wait = async (ms) => {
      waits += 1;
      // The person signs in by hand, then asks the holder to carry on.
      if (waits === 2) {
        gated = false;
        h.askResume();
      }
      await original(ms);
    };
    await expect(runApprovalSession(h.options)).resolves.toMatchObject({
      code: 0,
      reason: "queued",
    });
    expect(h.resumes).toBe(1);
    // One window throughout: the resume reused it rather than launching another.
    expect(h.windows).toBe(1);
    expect(h.calls).not.toContain("openPage:launch");
    expect(h.calls.filter((call) => call === "clickCreateExport")).toHaveLength(1);
  });

  it("resumes a blocked holder without resubmitting a submitted attempt", async () => {
    // An attempt that already submitted and then hit a blocker.
    writeRequestState({
      ...blankRequestState(),
      phase: "submitted_unverified",
      attempt: {
        attempt_id: "attempt-host",
        started_at: "2026-10-04T17:50:00.000Z",
        form_filled_at: "2026-10-04T17:51:00.000Z",
        submitted_at: "2026-10-04T17:52:00.000Z",
        pending_before: [],
      },
    });
    const h = harness({ queue: [[], [card()]], deadlineAt: 0, maxWaits: 12 });
    const original = h.options.wait;
    let waits = 0;
    h.options.wait = async (ms) => {
      waits += 1;
      if (waits === 1) h.askResume();
      await original(ms);
    };
    await expect(runApprovalSession(h.options)).resolves.toMatchObject({
      code: 0,
      reason: "queued",
    });
    expect(h.calls).not.toContain("fillForm");
    expect(h.calls).not.toContain("clickCreateExport");
    expect(h.windows).toBe(1);
    expect(h.calls).not.toContain("openPage:launch");
  });

  it("treats a resume as one request, not a standing instruction", async () => {
    const h = harness({ queue: [[]], deadlineAt: 0, maxWaits: 4 });
    const original = h.options.wait;
    let waits = 0;
    h.options.wait = async (ms) => {
      waits += 1;
      if (waits === 1) h.askResume();
      await original(ms);
    };
    await runApprovalSession(h.options);
    expect(h.resumes).toBe(1);
  });
});
