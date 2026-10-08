import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type RequestState,
  ABANDON_MIN_AGE_MIN,
  AWAITING_AUTH_MAX_MIN,
  SUBMITTED_UNVERIFIED_MAX_MIN,
  abandonUnconfirmedAttempt,
  blankRequestState,
  clearBlocker,
  planAttempt,
  readRequestState,
  recordAwaitingAuth,
  recordBlocked,
  recordFailure,
  recordFormFilled,
  recordQueueObservation,
  recordQueued,
  recordSubmitted,
  requestStatePath,
  startAttempt,
  writeRequestState,
} from "./request-state";

const now = new Date("2026-10-04T18:00:00.000Z");
const evidence = {
  source: "takeout_manage_queue" as const,
  exportId: "export-new",
  createdAtText: "Oct 4, 2026",
  observedAt: now.toISOString(),
};

let home: string;

function minutesBefore(from: Date, minutes: number): string {
  return new Date(from.getTime() - minutes * 60_000).toISOString();
}

const pendingCard = {
  exportId: "export-old",
  status: "in_progress" as const,
  products: ["youtube and youtube music"],
  createdAtText: "Sep 28, 2026",
};

function writeRaw(text: string): void {
  const stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "request-state.json"), text);
}

function agedQueuedState(): RequestState {
  const queuedAt = new Date("2026-09-20T18:00:00.000Z");
  return recordQueued(
    recordSubmitted(recordFormFilled(attemptState(), { now: queuedAt }), {
      now: queuedAt,
    }),
    { now: queuedAt, evidence },
  );
}

function attemptState(overrides: Partial<RequestState> = {}): RequestState {
  const started = startAttempt(blankRequestState(), {
    now,
    attemptId: "attempt-1",
    pendingBefore: [],
  });
  return { ...started, ...overrides };
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-request-state-"));
  vi.stubEnv(
    "YOUTUBE_TAKEOUT_STATE_DIR",
    path.join(home, ".hermes/workspace/state/youtube-takeout"),
  );
  vi.stubEnv("YOUTUBE_TAKEOUT_DATA_DIR", path.join(home, ".local/share/yt"));
  vi.stubEnv("YOUTUBE_TAKEOUT_CREDENTIALS_DIR", path.join(home, "credentials"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("request state persistence", () => {
  it("keeps request state in its own file and never writes the importer's", () => {
    const stateDir = path.join(home, ".hermes/workspace/state/youtube-takeout");
    expect(requestStatePath()).toBe(path.join(stateDir, "request-state.json"));
    writeRequestState(attemptState());
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(false);
    expect(fs.readdirSync(stateDir)).toEqual(["request-state.json"]);
  });

  it("reports an absent file as absent instead of inventing an idle attempt", () => {
    expect(readRequestState()).toEqual({ present: false, state: null });
    const written = attemptState();
    writeRequestState(written);
    expect(readRequestState()).toEqual({ present: true, state: written });
  });

  it("reports unreadable state as present but unparsed, never as idle", () => {
    writeRaw("{ truncated");
    expect(readRequestState()).toEqual({
      present: true,
      state: null,
      error: "unreadable",
    });
  });

  it("rejects a record that claims success without the evidence for it", () => {
    writeRaw(JSON.stringify({ schema: 1, phase: "queued" }));
    expect(readRequestState()).toMatchObject({ error: "unreadable" });

    const queued = recordQueued(
      recordSubmitted(recordFormFilled(attemptState(), { now }), { now }),
      { now, evidence },
    );
    for (const missing of ["queued_at", "queue_evidence"] as const) {
      writeRaw(JSON.stringify({ ...queued, [missing]: null }));
      expect(readRequestState()).toMatchObject({ error: "unreadable" });
    }
    writeRaw(
      JSON.stringify({
        ...queued,
        queue_evidence: { ...evidence, source: "drive_archive" },
      }),
    );
    expect(readRequestState()).toMatchObject({ error: "unreadable" });
    writeRaw(JSON.stringify(queued));
    expect(readRequestState().state).toEqual(queued);
  });

  it("rejects a record whose phase or vocabulary it does not recognise", () => {
    const good = attemptState();
    for (const bad of [
      { phase: "almost_queued" },
      { phase: 7 },
      { blocker: "whatever_i_want" },
      { auth_step: "email" },
      { last_error: "something_went_wrong" },
      { consecutive_failures: -1 },
      { consecutive_failures: 1.5 },
      { updated_at: "not-a-date" },
      { awaiting_auth_since: "yesterday" },
      { host: 42 },
      { last_queue_observation: { observedAt: "soon", pendingYouTube: true, exportIds: [] } },
      { schema: 2 },
    ]) {
      writeRaw(JSON.stringify({ ...good, ...bad }));
      expect(readRequestState(), JSON.stringify(bad)).toMatchObject({
        error: "unreadable",
      });
    }
  });

  it("accepts the sign-in steps and blockers, and nothing near them", () => {
    const good = attemptState();
    for (const auth_step of ["totp", "sms", "phone_prompt", "unknown"]) {
      writeRaw(JSON.stringify({ ...good, auth_step }));
      expect(readRequestState().state?.auth_step, auth_step).toBe(auth_step);
    }
    for (const blocker of [
      "password_rejected",
      "second_factor_required",
      "sign_in_rejected",
    ]) {
      writeRaw(JSON.stringify({ ...good, blocker }));
      expect(readRequestState().state?.blocker, blocker).toBe(blocker);
    }
    for (const bad of [{ auth_step: "email" }, { blocker: "password_wrong" }]) {
      writeRaw(JSON.stringify({ ...good, ...bad }));
      expect(readRequestState(), JSON.stringify(bad)).toMatchObject({
        error: "unreadable",
      });
    }
  });

  it("rejects an attempt whose own record contradicts itself", () => {
    const filled = recordFormFilled(attemptState(), { now });
    for (const bad of [
      { attempt: { ...filled.attempt, started_at: "whenever" } },
      { attempt: { ...filled.attempt, attempt_id: null } },
      { attempt: { ...filled.attempt, submitted_at: "later" } },
      // Submitted before the form was ever filled.
      {
        attempt: { ...filled.attempt, form_filled_at: null, submitted_at: now.toISOString() },
      },
      { attempt: { ...filled.attempt, pending_before: [{ exportId: 1 }] } },
      { attempt: { ...filled.attempt, pending_before: [{ ...pendingCard, status: "soon" }] } },
    ]) {
      writeRaw(JSON.stringify({ ...filled, ...bad }));
      expect(readRequestState(), JSON.stringify(bad)).toMatchObject({
        error: "unreadable",
      });
    }
  });

  it("rejects a phase that claims an attempt it does not have", () => {
    writeRaw(
      JSON.stringify({ ...blankRequestState(), phase: "awaiting_auth", attempt: null }),
    );
    expect(readRequestState()).toMatchObject({ error: "unreadable" });
    writeRaw(
      JSON.stringify({
        ...recordFormFilled(attemptState(), { now }),
        phase: "submitted_unverified",
      }),
    );
    expect(readRequestState()).toMatchObject({ error: "unreadable" });
  });

  it("stamps the writing host so another machine's state is not read as local", () => {
    writeRequestState(attemptState());
    expect(readRequestState().state?.host).toBe(os.hostname());
  });
});

describe("planAttempt", () => {
  it("starts a fresh attempt from a blank or failed state", () => {
    expect(planAttempt(blankRequestState(), now)).toMatchObject({
      action: "start_new",
    });
    expect(
      planAttempt(recordFailure(attemptState(), { now, error: "ui_failure" }), now),
    ).toMatchObject({ action: "start_new" });
  });

  it("keeps an unresolved submission unresolved after any error path", () => {
    const submitted = recordSubmitted(
      recordFormFilled(attemptState(), { now }),
      { now },
    );
    // The click itself can time out after Google already accepted it.
    const failed = recordFailure(submitted, { now, error: "ui_failure" });
    expect(failed.phase).toBe("failed");
    expect(failed.attempt?.submitted_at).toBe(now.toISOString());
    expect(planAttempt(failed, now)).toMatchObject({
      action: "verify_submitted",
      resubmit: false,
    });
    const laterStill = new Date(
      now.getTime() + (SUBMITTED_UNVERIFIED_MAX_MIN + 1) * 60_000,
    );
    expect(planAttempt(failed, laterStill)).toMatchObject({
      action: "recheck_blocked",
      reason: "submission_uncertain",
      resubmit: false,
    });
  });

  it("refuses to open a new attempt over an unresolved submission", () => {
    const failed = recordFailure(
      recordSubmitted(recordFormFilled(attemptState(), { now }), { now }),
      { now, error: "ui_failure" },
    );
    expect(() =>
      startAttempt(failed, { now, attemptId: "attempt-2", pendingBefore: [] }),
    ).toThrow("unresolved_submission");
  });

  it("resumes an auth wait without refilling the form or resubmitting", () => {
    const waiting = recordAwaitingAuth(
      recordFormFilled(attemptState(), { now }),
      { now, step: "passkey", blocker: null },
    );
    expect(planAttempt(waiting, now)).toMatchObject({
      action: "resume_awaiting_auth",
      refillForm: false,
      resubmit: false,
    });
  });

  it("starts over on a stale pre-submit wait only once the window is gone", () => {
    const filledAt = minutesBefore(now, AWAITING_AUTH_MAX_MIN + 1);
    const stale = recordAwaitingAuth(
      recordFormFilled(attemptState(), { now: new Date(filledAt) }),
      { now: new Date(filledAt), step: "passkey", blocker: null },
    );
    expect(planAttempt(stale, now, { sessionAlive: false })).toMatchObject({
      action: "start_new",
      reason: "auth_wait_expired",
    });
  });

  it("never replaces a live approval window just because the wait aged out", () => {
    const filledAt = minutesBefore(now, AWAITING_AUTH_MAX_MIN + 1);
    const stale = recordAwaitingAuth(
      recordFormFilled(attemptState(), { now: new Date(filledAt) }),
      { now: new Date(filledAt), step: "passkey", blocker: null },
    );
    expect(planAttempt(stale, now, { sessionAlive: true })).toEqual({
      action: "resume_awaiting_auth",
      refillForm: false,
      resubmit: false,
      operatorRecovery: true,
    });
  });

  it("verifies instead of resubmitting when a stale wait followed a submission", () => {
    const submittedAt = minutesBefore(now, AWAITING_AUTH_MAX_MIN + 1);
    const stale = recordAwaitingAuth(
      recordSubmitted(recordFormFilled(attemptState(), { now }), {
        now: new Date(submittedAt),
      }),
      { now: new Date(submittedAt), step: "passkey", blocker: null },
    );
    expect(planAttempt(stale, now)).toMatchObject({
      action: "verify_submitted",
      resubmit: false,
    });
  });

  it("verifies an unverified submission rather than clicking Create export again", () => {
    const submitted = recordSubmitted(
      recordFormFilled(attemptState(), { now }),
      { now },
    );
    expect(submitted.phase).toBe("submitted_unverified");
    expect(planAttempt(submitted, now)).toMatchObject({
      action: "verify_submitted",
      resubmit: false,
    });
  });

  it("refuses to repeat a submission that stayed uncertain past its window", () => {
    const submittedAt = minutesBefore(now, SUBMITTED_UNVERIFIED_MAX_MIN + 1);
    const stale = recordSubmitted(recordFormFilled(attemptState(), { now }), {
      now: new Date(submittedAt),
    });
    expect(planAttempt(stale, now)).toEqual({
      action: "recheck_blocked",
      reason: "submission_uncertain",
      refillForm: false,
      resubmit: false,
    });
  });

  it("does not request again while a confirmed export is still being built", () => {
    const queued = recordQueued(
      recordSubmitted(recordFormFilled(attemptState(), { now }), { now }),
      { now, evidence },
    );
    expect(queued.phase).toBe("queued");
    expect(planAttempt(queued, now)).toMatchObject({ action: "already_queued" });
  });

  it("will not call an old queued record proof that nothing is pending", () => {
    const queued = agedQueuedState();
    expect(planAttempt(queued, now)).toEqual({
      action: "observe_queue",
      reason: "queued_age_not_proof",
    });
    expect(planAttempt(queued, now, { pendingNow: null })).toEqual({
      action: "observe_queue",
      reason: "queued_age_not_proof",
    });
  });

  it("stays suppressed when the queue still shows an export being built", () => {
    expect(
      planAttempt(agedQueuedState(), now, {
        pendingNow: [
          {
            exportId: "export-new",
            status: "in_progress",
            products: ["youtube and youtube music"],
            createdAtText: "Sep 20, 2026",
          },
        ],
      }),
    ).toEqual({ action: "already_queued", reason: "export_still_building" });
  });

  it("allows a new attempt once a cycle passed and the queue is empty", () => {
    expect(
      planAttempt(agedQueuedState(), now, { pendingNow: [] }),
    ).toMatchObject({ action: "start_new", reason: "cycle_elapsed" });
  });

  it("offers a read-only recheck out of a blocker, not a dead end", () => {
    const blocked = recordBlocked(attemptState(), {
      now,
      reason: "credential_route_unavailable",
    });
    expect(planAttempt(blocked, now)).toEqual({
      action: "recheck_blocked",
      reason: "credential_route_unavailable",
      refillForm: false,
      resubmit: false,
    });
    // And still a recheck a week later, never a fresh submission.
    expect(
      planAttempt(blocked, new Date("2026-10-12T18:00:00.000Z")),
    ).toMatchObject({ action: "recheck_blocked", resubmit: false });
  });

  it("clears a blocker back to the phase the record justifies", () => {
    const blocked = recordBlocked(attemptState(), {
      now,
      reason: "credential_route_unavailable",
    });
    expect(clearBlocker(blocked, { now })).toMatchObject({
      phase: "idle",
      blocker: null,
      auth_step: null,
    });
    expect(planAttempt(clearBlocker(blocked, { now }), now)).toMatchObject({
      action: "start_new",
    });

    const submitted = recordBlocked(
      recordSubmitted(recordFormFilled(attemptState(), { now }), { now }),
      { now, reason: "submission_uncertain" },
    );
    const cleared = clearBlocker(submitted, { now });
    expect(cleared).toMatchObject({
      phase: "submitted_unverified",
      blocker: null,
    });
    expect(planAttempt(cleared, now)).toMatchObject({
      action: "verify_submitted",
    });
  });
});

describe("queue observation bookkeeping", () => {
  it("records Google's queue as an observation, not as an attribution", () => {
    const observed = recordQueueObservation(attemptState(), {
      now,
      exports: [
        {
          exportId: "export-old",
          status: "in_progress",
          products: ["youtube and youtube music"],
          createdAtText: "Sep 28, 2026",
        },
        {
          exportId: "export-done",
          status: "complete",
          products: ["youtube and youtube music"],
          createdAtText: "Sep 20, 2026",
        },
      ],
    });
    expect(observed.last_queue_observation).toEqual({
      observedAt: now.toISOString(),
      pendingYouTube: true,
      exportIds: ["export-old"],
    });
    expect(observed.phase).toBe("idle");
    expect(observed.queue_evidence).toBeNull();
  });
});

describe("transition bookkeeping", () => {
  it("marks awaiting_auth explicitly, with the step and the moment it began", () => {
    const waiting = recordAwaitingAuth(attemptState(), {
      now,
      step: "password",
      blocker: "credential_route_unavailable",
    });
    expect(waiting).toMatchObject({
      phase: "awaiting_auth",
      auth_step: "password",
      awaiting_auth_since: now.toISOString(),
      blocker: "credential_route_unavailable",
    });
  });

  it("remembers the form was filled so a resume cannot refill it", () => {
    const filled = recordFormFilled(attemptState(), { now });
    expect(filled.attempt?.form_filled_at).toBe(now.toISOString());
    const waiting = recordAwaitingAuth(filled, {
      now,
      step: "passkey",
      blocker: null,
    });
    expect(waiting.attempt?.form_filled_at).toBe(now.toISOString());
  });

  it("records the snapshot of exports pending before the attempt began", () => {
    const pending = [
      {
        exportId: "export-old",
        status: "in_progress" as const,
        products: ["youtube and youtube music"],
        createdAtText: "Sep 28, 2026",
      },
    ];
    const started = startAttempt(blankRequestState(), {
      now,
      attemptId: "attempt-2",
      pendingBefore: pending,
    });
    expect(started.attempt).toMatchObject({
      attempt_id: "attempt-2",
      pending_before: pending,
      form_filled_at: null,
      submitted_at: null,
    });
  });

  it("clears the blocker and failure count only when an export is confirmed", () => {
    const failed = recordFailure(
      recordBlocked(attemptState(), { now, reason: "native_modal_present" }),
      { now, error: "ui_failure" },
    );
    expect(failed.consecutive_failures).toBe(1);
    const queued = recordQueued(failed, { now, evidence });
    expect(queued).toMatchObject({
      phase: "queued",
      blocker: null,
      last_error: null,
      consecutive_failures: 0,
      queued_at: now.toISOString(),
      queue_evidence: evidence,
    });
  });

  it("keeps a surfaced failure visible and counts repeats", () => {
    const first = recordFailure(attemptState(), { now, error: "ui_failure" });
    const second = recordFailure(first, { now, error: "ui_failure" });
    expect(second).toMatchObject({
      phase: "failed",
      last_error: "ui_failure",
      consecutive_failures: 2,
    });
  });
});

describe("abandonUnconfirmedAttempt", () => {
  const expiredCard = { ...pendingCard, exportId: "export-expired", status: "complete" as const };

  /** The live record of 2026-10-06: clicked, bounced to a passkey, never verified. */
  function bouncedAttempt(submittedMinutesAgo: number): RequestState {
    const submittedAt = new Date(now.getTime() - submittedMinutesAgo * 60_000);
    const submitted = recordSubmitted(
      recordFormFilled(attemptState(), { now: submittedAt }),
      { now: submittedAt },
    );
    return recordBlocked(
      recordAwaitingAuth(submitted, {
        now: submittedAt,
        step: "passkey",
        blocker: "passkey_tap_required",
      }),
      { now: submittedAt, reason: "credential_route_unavailable" },
    );
  }

  it("gives up on a click Google never turned into an export, so a new one can start", () => {
    const state = bouncedAttempt(36 * 60);
    // Without it, the record can only ever be rechecked.
    expect(planAttempt(state, now).action).toBe("recheck_blocked");

    const result = abandonUnconfirmedAttempt(state, {
      now,
      attemptId: "attempt-1",
      exports: [expiredCard],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({
      phase: "idle",
      attempt: null,
      blocker: null,
      last_queue_observation: { pendingYouTube: false, exportIds: [] },
    });
    expect(planAttempt(result.state, now)).toEqual({ action: "start_new", reason: "fresh" });

    // And it is a record the reader accepts.
    writeRequestState(result.state);
    expect(readRequestState().state).toEqual(result.state);
  });

  it("refuses an attempt other than the one on record", () => {
    expect(
      abandonUnconfirmedAttempt(bouncedAttempt(36 * 60), {
        now,
        attemptId: "attempt-2",
        exports: [],
      }),
    ).toEqual({ ok: false, reason: "no_such_attempt" });
    expect(
      abandonUnconfirmedAttempt(blankRequestState(), { now, attemptId: "attempt-1", exports: [] }),
    ).toEqual({ ok: false, reason: "no_such_attempt" });
  });

  it("refuses an attempt that never clicked Create export", () => {
    expect(
      abandonUnconfirmedAttempt(attemptState(), { now, attemptId: "attempt-1", exports: [] }),
    ).toEqual({ ok: false, reason: "not_submitted" });
  });

  it("refuses a confirmed export", () => {
    expect(
      abandonUnconfirmedAttempt(agedQueuedState(), { now, attemptId: "attempt-1", exports: [] }),
    ).toEqual({ ok: false, reason: "already_queued" });
  });

  it("refuses while Google may still be turning the click into an export", () => {
    expect(
      abandonUnconfirmedAttempt(bouncedAttempt(ABANDON_MIN_AGE_MIN - 1), {
        now,
        attemptId: "attempt-1",
        exports: [],
      }),
    ).toEqual({ ok: false, reason: "too_recent" });
  });

  it("refuses when a YouTube export is building, which may be this attempt's", () => {
    expect(
      abandonUnconfirmedAttempt(bouncedAttempt(36 * 60), {
        now,
        attemptId: "attempt-1",
        exports: [pendingCard],
      }),
    ).toEqual({ ok: false, reason: "export_building" });
  });
});
