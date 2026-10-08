import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  type ManageExportObservation,
  driveArchiveObservation,
  manageQueueObservation,
  unknownObservation,
} from "./queue-evidence";
import { type RequestFlowDeps, runRequestAttempt } from "./request-flow";
import {
  AWAITING_AUTH_MAX_MIN,
  type RequestState,
  blankRequestState,
  readRequestState,
  writeRequestState,
} from "./request-state";
import type { SessionView } from "./session";

let home: string;
let stateDir: string;
let clock: Date;

const page = { marker: "fixture-page" };

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
  deps: RequestFlowDeps;
  calls: string[];
  openPage: Mock<RequestFlowDeps["openPage"]>;
  fillForm: Mock<RequestFlowDeps["fillForm"]>;
  clickCreateExport: Mock<RequestFlowDeps["clickCreateExport"]>;
  observeQueue: Mock<RequestFlowDeps["observeQueue"]>;
  detectAuthGate: Mock<RequestFlowDeps["detectAuthGate"]>;
  formReady: Mock<RequestFlowDeps["formReady"]>;
};

/** Every browser step is a fixture. Nothing here opens a window or reaches
 *  Google; the flow only sees the observations these functions return. */
function harness(options: {
  queue?: ManageExportObservation[][];
  session?: SessionView;
  authGate?: RequestFlowDeps["detectAuthGate"];
  formReady?: boolean;
} = {}): Harness {
  const calls: string[] = [];
  const queues = options.queue ?? [[]];
  let observation = 0;
  const openPage = vi.fn(async (opts: { attach: boolean; readOnly: boolean }) => {
    calls.push(
      `openPage:${opts.attach ? "attach" : "launch"}:${opts.readOnly ? "ro" : "rw"}`,
    );
    return page;
  });
  const fillForm = vi.fn(async () => {
    calls.push("fillForm");
  });
  const clickCreateExport = vi.fn(async () => {
    calls.push("clickCreateExport");
  });
  const observeQueue = vi.fn(async () => {
    calls.push("observeQueue");
    const exports = queues[Math.min(observation, queues.length - 1)] ?? [];
    observation += 1;
    return manageQueueObservation(exports, clock.toISOString());
  });
  const detectAuthGate = vi.fn(async (p: object) => {
    calls.push("detectAuthGate");
    return options.authGate ? await options.authGate(p) : null;
  });
  const formReady = vi.fn(async () => {
    calls.push("formReady");
    return options.formReady ?? false;
  });
  const deps: RequestFlowDeps = {
    now: () => clock,
    newAttemptId: () => "attempt-fixture",
    loadState: () => readRequestState(),
    saveState: writeRequestState,
    sessionView: () => options.session ?? { kind: "none" },
    openPage,
    fillForm,
    clickCreateExport,
    observeQueue,
    detectAuthGate,
    formReady,
  };
  return {
    deps,
    calls,
    openPage,
    fillForm,
    clickCreateExport,
    observeQueue,
    detectAuthGate,
    formReady,
  };
}

function state(): RequestState {
  const read = readRequestState();
  expect(read.present).toBe(true);
  return read.state!;
}

beforeEach(() => {
  clock = new Date("2026-10-04T18:00:00.000Z");
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-request-flow-"));
  stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
  vi.stubEnv("YOUTUBE_TAKEOUT_STATE_DIR", stateDir);
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, ".local/share/yt"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("a fresh attempt", () => {
  it("queues only once a /manage card proves the export exists", async () => {
    const h = harness({ queue: [[], [card()]] });
    const outcome = await runRequestAttempt(h.deps);
    expect(outcome).toMatchObject({
      kind: "queued",
      evidence: { source: "takeout_manage_queue", exportId: "export-new" },
    });
    expect(h.calls).toEqual([
      "openPage:launch:rw",
      "detectAuthGate",
      "observeQueue",
      "formReady",
      "fillForm",
      "detectAuthGate",
      "clickCreateExport",
      "detectAuthGate",
      "observeQueue",
    ]);
    expect(state()).toMatchObject({ phase: "queued" });
  });

  it("does not call a click plus a page change a queued export", async () => {
    const h = harness({ queue: [[], []] });
    const outcome = await runRequestAttempt(h.deps);
    expect(outcome).toEqual({
      kind: "submission_unverified",
      reason: "no_in_progress_export",
    });
    expect(state()).toMatchObject({ phase: "submitted_unverified" });
  });

  it("will not start from a Drive listing, which is delivery and not the queue", async () => {
    const h = harness({ queue: [[]] });
    h.deps.observeQueue = vi.fn(async () =>
      driveArchiveObservation(
        {
          fileId: "drive-1",
          name: "takeout-20261004T175000Z-1-001.zip",
          createdAt: "2026-10-04T17:55:00.000Z",
        },
        clock.toISOString(),
      ),
    );
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "queue_unobserved",
      reason: "not_a_queue_source",
    });
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).not.toHaveBeenCalled();
    expect(readRequestState().present).toBe(false);
  });

  it.each(["unreadable", "auth_gate", "not_takeout", "missing"] as const)(
    "will not read a %s page as an empty queue",
    async (reason) => {
      const h = harness({ queue: [[]] });
      h.deps.observeQueue = vi.fn(async () =>
        unknownObservation(reason, clock.toISOString()),
      );
      expect(await runRequestAttempt(h.deps)).toEqual({
        kind: "queue_unobserved",
        reason,
      });
      expect(h.fillForm).not.toHaveBeenCalled();
      expect(h.clickCreateExport).not.toHaveBeenCalled();
      expect(readRequestState().present).toBe(false);
    },
  );

  it("suppresses a duplicate when Google is already building an export", async () => {
    const h = harness({ queue: [[card({ exportId: "export-old" })]] });
    const outcome = await runRequestAttempt(h.deps);
    expect(outcome).toEqual({
      kind: "pending_export_exists",
      exportIds: ["export-old"],
    });
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).not.toHaveBeenCalled();
    expect(state()).toMatchObject({
      phase: "idle",
      last_queue_observation: { pendingYouTube: true, exportIds: ["export-old"] },
    });
    expect(state().queue_evidence).toBeNull();
  });

  it("parks on a gate found on the way in, without filling the form", async () => {
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "awaiting_auth",
      step: "passkey",
      blocker: "passkey_tap_required",
      operatorRecovery: false,
    });
    expect(h.calls).toEqual(["openPage:launch:rw", "detectAuthGate"]);
    expect(h.observeQueue).not.toHaveBeenCalled();
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).not.toHaveBeenCalled();
    expect(state()).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "passkey",
      awaiting_auth_since: clock.toISOString(),
      attempt: { form_filled_at: null, submitted_at: null, pending_before: null },
    });
  });

  it("parks on a gate raised by the form, with the form filled", async () => {
    let filled = false;
    const h = harness({
      queue: [[]],
      authGate: async () =>
        filled ? { step: "password", blocker: "credential_route_unavailable" } : null,
    });
    h.fillForm.mockImplementation(async () => {
      h.calls.push("fillForm");
      filled = true;
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
      step: "password",
    });
    expect(h.clickCreateExport).not.toHaveBeenCalled();
    expect(state()).toMatchObject({
      phase: "awaiting_auth",
      attempt: { form_filled_at: clock.toISOString(), submitted_at: null },
    });
  });

  it("writes nothing into the importer's state file", async () => {
    const h = harness({ queue: [[], [card()]] });
    await runRequestAttempt(h.deps);
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
    expect(fs.readdirSync(stateDir).sort()).toEqual(["request-state.json"]);
  });
});

describe("an uncertain submission", () => {
  it("records the submission before the click, so a throw cannot lose it", async () => {
    const h = harness({ queue: [[]] });
    h.clickCreateExport.mockImplementation(async () => {
      h.calls.push("clickCreateExport");
      expect(state()).toMatchObject({
        phase: "submitted_unverified",
        attempt: { submitted_at: clock.toISOString() },
      });
      throw new Error("navigation timeout");
    });
    const outcome = await runRequestAttempt(h.deps);
    expect(outcome).toEqual({ kind: "failed", error: "ui_failure" });
    expect(state()).toMatchObject({
      phase: "failed",
      last_error: "ui_failure",
      attempt: { submitted_at: clock.toISOString() },
    });
  });

  it("verifies the next time instead of refilling or clicking again", async () => {
    const first = harness({ queue: [[]] });
    first.clickCreateExport.mockRejectedValue(new Error("navigation timeout"));
    await runRequestAttempt(first.deps);

    clock = new Date("2026-10-04T18:20:00.000Z");
    const second = harness({ queue: [[card()]] });
    const outcome = await runRequestAttempt(second.deps);
    expect(outcome).toMatchObject({ kind: "queued" });
    expect(second.calls).toEqual(["openPage:launch:ro", "observeQueue"]);
    expect(second.fillForm).not.toHaveBeenCalled();
    expect(second.clickCreateExport).not.toHaveBeenCalled();
  });

  it("will not credit the export that was already pending beforehand", async () => {
    const pending = card({ exportId: "export-old" });
    writeRequestState({
      ...blankRequestState(),
      phase: "submitted_unverified",
      attempt: {
        attempt_id: "attempt-1",
        started_at: "2026-10-04T17:50:00.000Z",
        form_filled_at: "2026-10-04T17:51:00.000Z",
        submitted_at: "2026-10-04T17:52:00.000Z",
        pending_before: [pending],
      },
    });
    const h = harness({ queue: [[pending]] });
    const outcome = await runRequestAttempt(h.deps);
    expect(outcome).toEqual({
      kind: "submission_unverified",
      reason: "pre_existing_export",
    });
    expect(state().phase).toBe("submitted_unverified");
  });

  it("rechecks read-only once the uncertainty outlives its window", async () => {
    const first = harness({ queue: [[]] });
    first.clickCreateExport.mockRejectedValue(new Error("navigation timeout"));
    await runRequestAttempt(first.deps);

    // Past the window, with a gate still up and an empty queue: still blocked,
    // and still nothing submitted.
    clock = new Date("2026-10-05T02:00:00.000Z");
    const second = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
    });
    expect(await runRequestAttempt(second.deps)).toEqual({
      kind: "blocked",
      reason: "passkey_tap_required",
    });
    expect(second.calls).toEqual([
      "openPage:launch:ro",
      "observeQueue",
      "detectAuthGate",
    ]);
    expect(second.fillForm).not.toHaveBeenCalled();
    expect(second.clickCreateExport).not.toHaveBeenCalled();

    // A week later it is still a recheck, never a second Create export.
    clock = new Date("2026-10-12T02:00:00.000Z");
    const third = harness({ queue: [[]] });
    await runRequestAttempt(third.deps);
    expect(third.fillForm).not.toHaveBeenCalled();
    expect(third.clickCreateExport).not.toHaveBeenCalled();
  });

  it("reports the standing blocker when the recheck cannot see the queue", async () => {
    const first = harness({ queue: [[]] });
    first.clickCreateExport.mockRejectedValue(new Error("navigation timeout"));
    await runRequestAttempt(first.deps);

    clock = new Date("2026-10-05T02:00:00.000Z");
    const second = harness({ queue: [[]] });
    second.observeQueue.mockImplementation(async () => {
      second.calls.push("observeQueue");
      return unknownObservation("auth_gate", clock.toISOString());
    });
    expect(await runRequestAttempt(second.deps)).toEqual({
      kind: "blocked",
      reason: "submission_uncertain",
    });
    expect(second.clickCreateExport).not.toHaveBeenCalled();
  });

  it("keeps a refused password on the record through every recheck", async () => {
    writeRequestState({
      ...blankRequestState(),
      phase: "awaiting_auth",
      auth_step: "password",
      blocker: "password_rejected",
      awaiting_auth_since: "2026-10-04T17:55:00.000Z",
      attempt: {
        attempt_id: "attempt-1",
        started_at: "2026-10-04T17:50:00.000Z",
        form_filled_at: "2026-10-04T17:51:00.000Z",
        submitted_at: "2026-10-04T17:52:00.000Z",
        pending_before: [],
      },
    });
    // The page now shows an ordinary password prompt; the refusal still wins.
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "password", blocker: "credential_route_unavailable" }),
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "blocked",
      reason: "password_rejected",
    });
    expect(state().blocker).toBe("password_rejected");
    expect(h.fillForm).not.toHaveBeenCalled();
  });

  it("resolves the uncertainty when the recheck finds the export", async () => {
    const first = harness({ queue: [[]] });
    first.clickCreateExport.mockRejectedValue(new Error("navigation timeout"));
    await runRequestAttempt(first.deps);

    clock = new Date("2026-10-05T02:00:00.000Z");
    const second = harness({ queue: [[card()]] });
    expect(await runRequestAttempt(second.deps)).toMatchObject({
      kind: "queued",
      evidence: { exportId: "export-new" },
    });
    expect(second.clickCreateExport).not.toHaveBeenCalled();
  });

  it("lets a cleared gate return the attempt to verification, not to a new one", async () => {
    const first = harness({ queue: [[]] });
    first.clickCreateExport.mockRejectedValue(new Error("navigation timeout"));
    await runRequestAttempt(first.deps);

    clock = new Date("2026-10-05T02:00:00.000Z");
    const second = harness({ queue: [[]] });
    expect(await runRequestAttempt(second.deps)).toMatchObject({
      kind: "submission_unverified",
    });
    expect(state()).toMatchObject({
      phase: "submitted_unverified",
      blocker: null,
    });
    expect(second.fillForm).not.toHaveBeenCalled();
    expect(second.clickCreateExport).not.toHaveBeenCalled();
  });
});

describe("an auth prompt that interrupts a step", () => {
  it("parks instead of failing when the form fill is cut off by the gate", async () => {
    let gated = false;
    const h = harness({
      queue: [[]],
      authGate: async () =>
        gated ? { step: "password", blocker: "credential_route_unavailable" } : null,
    });
    h.fillForm.mockImplementation(async () => {
      h.calls.push("fillForm");
      gated = true;
      throw new Error("navigation interrupted");
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "awaiting_auth",
      step: "password",
      blocker: "credential_route_unavailable",
      operatorRecovery: false,
    });
    expect(state()).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "password",
      blocker: "credential_route_unavailable",
      attempt: { submitted_at: null },
    });
    expect(h.clickCreateExport).not.toHaveBeenCalled();
  });

  it("still reports a plain UI failure when no gate is showing", async () => {
    const h = harness({ queue: [[]] });
    h.fillForm.mockRejectedValue(new Error("selector missing"));
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "failed",
      error: "ui_failure",
    });
    expect(state()).toMatchObject({ phase: "failed", last_error: "ui_failure" });
  });

  it("keeps an interrupted submission uncertain even while parked at the gate", async () => {
    let gated = false;
    const h = harness({
      queue: [[]],
      authGate: async () =>
        gated ? { step: "passkey", blocker: "passkey_tap_required" } : null,
    });
    h.clickCreateExport.mockImplementation(async () => {
      h.calls.push("clickCreateExport");
      gated = true;
      throw new Error("navigation timeout");
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
      step: "passkey",
    });
    expect(state()).toMatchObject({
      phase: "awaiting_auth",
      attempt: { submitted_at: clock.toISOString() },
    });
  });

  it("does not mistake a gate probe failure for a parked attempt", async () => {
    const h = harness({ queue: [[]] });
    h.fillForm.mockRejectedValue(new Error("selector missing"));
    h.detectAuthGate.mockImplementation(async () => {
      throw new Error("page closed");
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "failed",
      error: "ui_failure",
    });
  });
});

describe("a request record that cannot be parsed", () => {
  it("blocks without opening a page and leaves the file for an operator", async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const raw = JSON.stringify({ schema: 1, phase: "queued" });
    fs.writeFileSync(path.join(stateDir, "request-state.json"), raw);
    const h = harness({ queue: [[card()]] });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "blocked",
      reason: "request_state_unreadable",
    });
    expect(h.openPage).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(stateDir, "request-state.json"), "utf8")).toBe(
      raw,
    );
  });
});

describe("resuming an auth wait", () => {
  const liveSession: SessionView = {
    kind: "alive",
    record: {
      schema: 1,
      pid: process.pid,
      started_at: "2026-10-04T18:00:00.000Z",
      mode: "headed",
      attempt_id: "attempt-fixture",
      host: os.hostname(),
    },
  };

  /** Parked before submitting: a gate met on the way in. */
  async function parkBeforeSubmit(): Promise<void> {
    const h = harness({
      queue: [[]],
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
    });
    expect(state().attempt?.submitted_at).toBeNull();
  }

  /** Parked after submitting: a gate raised by the click itself. */
  async function parkAfterSubmit(): Promise<void> {
    let submitted = false;
    const h = harness({
      queue: [[]],
      authGate: async () =>
        submitted ? { step: "passkey", blocker: "passkey_tap_required" } : null,
    });
    h.clickCreateExport.mockImplementation(async () => {
      h.calls.push("clickCreateExport");
      submitted = true;
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
    });
    expect(state().attempt?.submitted_at).toBe(clock.toISOString());
  }

  it("keeps waiting while the gate is up, without navigating away from it", async () => {
    await parkAfterSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const h = harness({
      queue: [[card()]],
      session: liveSession,
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
      step: "passkey",
      operatorRecovery: false,
    });
    expect(h.calls).toEqual(["openPage:attach:ro", "detectAuthGate"]);
    expect(h.observeQueue).not.toHaveBeenCalled();
    expect(state().awaiting_auth_since).toBe("2026-10-04T18:00:00.000Z");
  });

  it("verifies a submitted attempt once the gate clears, without resubmitting", async () => {
    await parkAfterSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const h = harness({ queue: [[card()]], session: liveSession });
    expect(await runRequestAttempt(h.deps)).toMatchObject({ kind: "queued" });
    expect(h.calls).toEqual([
      "openPage:attach:ro",
      "detectAuthGate",
      "observeQueue",
    ]);
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).not.toHaveBeenCalled();
  });

  it("completes the first submission after a human clears the initial gate", async () => {
    await parkBeforeSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    // Gate cleared, queue empty, so this attempt finally gets to submit — once.
    const h = harness({ queue: [[], [card()]], session: liveSession });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "queued",
      evidence: { exportId: "export-new" },
    });
    expect(h.calls).toEqual([
      "openPage:attach:rw",
      "detectAuthGate",
      "observeQueue",
      "formReady",
      "fillForm",
      "detectAuthGate",
      "clickCreateExport",
      "detectAuthGate",
      "observeQueue",
    ]);
    expect(h.openPage).toHaveBeenCalledTimes(1);
    expect(h.fillForm).toHaveBeenCalledTimes(1);
    expect(h.clickCreateExport).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({
      phase: "queued",
      attempt: { attempt_id: "attempt-fixture", submitted_at: clock.toISOString() },
    });
  });

  it("does not refill a form the page is already holding", async () => {
    await parkBeforeSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const h = harness({
      queue: [[], [card()]],
      session: liveSession,
      formReady: true,
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({ kind: "queued" });
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).toHaveBeenCalledTimes(1);
  });

  it("still submits only once when the resume is retried", async () => {
    await parkBeforeSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const first = harness({ queue: [[], []], session: liveSession });
    expect(await runRequestAttempt(first.deps)).toMatchObject({
      kind: "submission_unverified",
    });
    expect(first.clickCreateExport).toHaveBeenCalledTimes(1);

    clock = new Date("2026-10-04T18:20:00.000Z");
    const second = harness({ queue: [[card()]], session: liveSession });
    expect(await runRequestAttempt(second.deps)).toMatchObject({ kind: "queued" });
    expect(second.fillForm).not.toHaveBeenCalled();
    expect(second.clickCreateExport).not.toHaveBeenCalled();
  });

  it("suppresses a duplicate if an export appeared while it waited", async () => {
    await parkBeforeSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const h = harness({
      queue: [[card({ exportId: "export-old" })]],
      session: liveSession,
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "pending_export_exists",
      exportIds: ["export-old"],
    });
    expect(h.fillForm).not.toHaveBeenCalled();
    expect(h.clickCreateExport).not.toHaveBeenCalled();
  });

  it("will not submit on a queue it could not read", async () => {
    await parkBeforeSubmit();
    clock = new Date("2026-10-04T18:10:00.000Z");
    const h = harness({ queue: [[]], session: liveSession });
    h.observeQueue.mockImplementation(async () => {
      h.calls.push("observeQueue");
      return unknownObservation("unreadable", clock.toISOString());
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "queue_unobserved",
      reason: "unreadable",
    });
    expect(h.clickCreateExport).not.toHaveBeenCalled();
    expect(state().phase).toBe("awaiting_auth");
  });

  it("never opens a second window once the wait has aged out", async () => {
    await parkBeforeSubmit();
    clock = new Date(
      Date.parse("2026-10-04T18:00:00.000Z") +
        (AWAITING_AUTH_MAX_MIN + 5) * 60_000,
    );
    const h = harness({
      queue: [[]],
      session: liveSession,
      authGate: async () => ({ step: "passkey", blocker: "passkey_tap_required" }),
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "awaiting_auth",
      operatorRecovery: true,
    });
    expect(h.calls).toEqual(["openPage:attach:rw", "detectAuthGate"]);
    expect(h.openPage).toHaveBeenCalledTimes(1);
    expect(h.fillForm).not.toHaveBeenCalled();
  });

  it("starts a new attempt after the wait ages out with the window gone", async () => {
    await parkBeforeSubmit();
    clock = new Date(
      Date.parse("2026-10-04T18:00:00.000Z") +
        (AWAITING_AUTH_MAX_MIN + 5) * 60_000,
    );
    const h = harness({
      queue: [[], [card()]],
      session: {
        kind: "dead",
        record: { ...liveSession.record, pid: 4242 },
      },
    });
    expect(await runRequestAttempt(h.deps)).toMatchObject({ kind: "queued" });
    expect(h.fillForm).toHaveBeenCalledTimes(1);
    expect(h.clickCreateExport).toHaveBeenCalledTimes(1);
  });
});

describe("a confirmed export", () => {
  async function queueOne(): Promise<void> {
    const h = harness({ queue: [[], [card()]] });
    expect(await runRequestAttempt(h.deps)).toMatchObject({ kind: "queued" });
  }

  it("suppresses further requests for the rest of the cycle", async () => {
    await queueOne();
    clock = new Date("2026-10-05T18:00:00.000Z");
    const h = harness({ queue: [[]] });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "already_queued",
      reason: "within_cycle",
    });
    expect(h.openPage).not.toHaveBeenCalled();
  });

  it("looks at the real queue before requesting again, instead of trusting age", async () => {
    await queueOne();
    clock = new Date("2026-10-11T18:00:00.000Z");
    const stillBuilding = harness({ queue: [[card({ exportId: "export-old" })]] });
    expect(await runRequestAttempt(stillBuilding.deps)).toEqual({
      kind: "already_queued",
      reason: "export_still_building",
    });
    expect(stillBuilding.calls).toEqual(["openPage:launch:ro", "observeQueue"]);
    expect(stillBuilding.fillForm).not.toHaveBeenCalled();
    expect(stillBuilding.clickCreateExport).not.toHaveBeenCalled();
  });

  it("asks again only when the queue is observed to be empty", async () => {
    await queueOne();
    clock = new Date("2026-10-11T18:00:00.000Z");
    // The empty snapshot that cleared the suppression is also the baseline,
    // so the attempt reads the queue twice, not three times.
    const h = harness({ queue: [[], [card({ exportId: "export-next" })]] });
    expect(await runRequestAttempt(h.deps)).toMatchObject({
      kind: "queued",
      evidence: { exportId: "export-next" },
    });
    expect(h.observeQueue).toHaveBeenCalledTimes(2);
    expect(h.fillForm).toHaveBeenCalledTimes(1);
    expect(h.clickCreateExport).toHaveBeenCalledTimes(1);
  });
});

describe("another machine's session", () => {
  it("defers without opening a window or claiming anything", async () => {
    const h = harness({
      queue: [[]],
      session: {
        kind: "foreign",
        record: {
          schema: 1,
          pid: 4242,
          started_at: "2026-10-04T18:00:00.000Z",
          mode: "headed",
          attempt_id: "attempt-elsewhere",
          host: "other.local",
        },
      },
    });
    expect(await runRequestAttempt(h.deps)).toEqual({
      kind: "deferred",
      reason: "foreign_host",
    });
    expect(h.openPage).not.toHaveBeenCalled();
    expect(readRequestState().present).toBe(false);
  });
});
