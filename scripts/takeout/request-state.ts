/**
 * The request-only state machine, kept apart from the importer's state.
 *
 * `state.json` belongs to the daily importer: what it ingested, when, and from
 * which archive. Asking Google for a new export is a different job with a
 * different failure mode — it can sit half-finished behind an interactive auth
 * step for an hour — and writing that into the importer's file is how a
 * half-finished request ends up read as an ingestion fact. So requests live in
 * `request-state.json`, which nothing in the import path reads or writes.
 *
 * `request.ts` and `approve.ts` share this machine. The phases are:
 *
 *   idle                 nothing in flight
 *   awaiting_auth        a human step is required and the attempt is parked
 *   submitted_unverified "Create export" was clicked and nothing has proved it
 *   queued               a /manage observation proved the export exists
 *   failed               surfaced failure, retryable
 *
 * Everything here is pure except the two file functions at the bottom, so the
 * transitions can be tested without a browser.
 */
import * as fs from "fs";
import * as os from "os";

import { takeoutPaths } from "./config";
import {
  type ManageExportObservation,
  type QueueEvidence,
  pendingPossiblyYouTubeExports,
} from "./queue-evidence";

/** How long a parked auth step stays resumable before it is reconsidered. */
export const AWAITING_AUTH_MAX_MIN = 120;
/** How long an unproven submission is re-checked before an operator is needed. */
export const SUBMITTED_UNVERIFIED_MAX_MIN = 180;
/** A confirmed export suppresses new requests for one weekly cycle. */
export const QUEUED_SUPPRESS_HOURS = 120;
/** How old a submission must be before an operator may give up on it. */
export const ABANDON_MIN_AGE_MIN = 30;

export type RequestPhase =
  | "idle"
  | "awaiting_auth"
  | "submitted_unverified"
  | "queued"
  | "failed";

/** Which sign-in screen an attempt is parked on. */
export type AuthStep =
  | "passkey"
  | "password"
  | "totp"
  | "sms"
  | "phone_prompt"
  | "unknown";

/** Why a human has to act before the attempt can move. Closed vocabulary: the
 *  launcher relays these verbatim, so they must never carry free-form detail. */
export type RequestBlocker =
  | "credential_route_unavailable"
  | "native_modal_present"
  | "native_modal_driver_unavailable"
  | "submission_uncertain"
  | "passkey_tap_required"
  | "request_state_unreadable"
  // The next three belonged to the stored-password sign-in, removed on
  // 2026-10-07 because nothing may hold the Google password. Nothing writes
  // them now; they stay so the worker launcher's allow list and any record
  // already on disk keep parsing.
  /** Google refused the stored password. Never retried: that is how accounts lock. */
  | "password_rejected"
  /** A code or a tap only a person can give, in the window that is already open. */
  | "second_factor_required"
  /** Google refused to sign this browser in at all. */
  | "sign_in_rejected";

/**
 * The one blocker a human clears from inside the window we already opened.
 * Every other blocker needs something changed outside the browser flow, so
 * continuing the automated steps cannot help and must not be attempted.
 */
const RESUMABLE_BLOCKERS = new Set<RequestBlocker>([
  "passkey_tap_required",
  "second_factor_required",
]);

export type RequestFailure =
  | "ui_failure"
  | "session_cookies_missing"
  | "queue_unreadable"
  | "password_route_failed";

export type RequestAttempt = {
  attempt_id: string;
  started_at: string;
  /** Set once the Takeout form is filled. A resume must not refill it. */
  form_filled_at: string | null;
  /** Set once "Create export" is clicked. Never clicked twice per attempt. */
  submitted_at: string | null;
  /** Exports already being built before this attempt touched anything. */
  pending_before: ManageExportObservation[] | null;
};

/** What the /manage list looked like the last time anyone read it. */
export type QueueSnapshot = {
  observedAt: string;
  /** Google was building at least one export that could be the YouTube one. */
  pendingYouTube: boolean;
  exportIds: string[];
};

export type RequestState = {
  schema: 1;
  phase: RequestPhase;
  attempt: RequestAttempt | null;
  awaiting_auth_since: string | null;
  auth_step: AuthStep | null;
  blocker: RequestBlocker | null;
  queued_at: string | null;
  queue_evidence: QueueEvidence | null;
  last_error: RequestFailure | null;
  consecutive_failures: number;
  /** Read-only fact about Google's queue, not a claim about this attempt. */
  last_queue_observation: QueueSnapshot | null;
  updated_at: string;
  /** The machine that wrote this. Another host's record cannot be verified
   *  from here, so readers report it as unknown rather than acting on it. */
  host: string;
};

export function blankRequestState(): RequestState {
  return {
    schema: 1,
    phase: "idle",
    attempt: null,
    awaiting_auth_since: null,
    auth_step: null,
    blocker: null,
    queued_at: null,
    queue_evidence: null,
    last_error: null,
    consecutive_failures: 0,
    last_queue_observation: null,
    updated_at: new Date(0).toISOString(),
    host: os.hostname(),
  };
}

function minutesSince(iso: string | null, now: Date): number {
  if (!iso) return Infinity;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return Infinity;
  return (now.getTime() - at) / 60_000;
}

export type AttemptPlan =
  | { action: "start_new"; reason: "fresh" | "auth_wait_expired" | "cycle_elapsed" }
  | {
      action: "resume_awaiting_auth";
      refillForm: false;
      resubmit: false;
      /** The wait outlived its window; a human has to finish or release it. */
      operatorRecovery: boolean;
    }
  | { action: "verify_submitted"; resubmit: false }
  | {
      /** Read-only: observe the queue and the gate, change nothing else. */
      action: "recheck_blocked";
      reason: RequestBlocker;
      refillForm: false;
      resubmit: false;
    }
  | { action: "already_queued"; reason: "within_cycle" | "export_still_building" }
  | { action: "observe_queue"; reason: "queued_age_not_proof" };

function recheck(reason: RequestBlocker): AttemptPlan {
  return { action: "recheck_blocked", reason, refillForm: false, resubmit: false };
}

export type PlanContext = {
  /** Whether the preserved approval window is still alive. Omitted = unknown. */
  sessionAlive?: boolean;
  /** A /manage snapshot the caller just took. Omitted = not observed. */
  pendingNow?: ManageExportObservation[] | null;
};

/**
 * Decide what a new invocation of request.ts/approve.ts is allowed to do.
 *
 * Three rules do the real work here:
 *
 * 1. An attempt that clicked "Create export" can only ever be verified, never
 *    resubmitted — including when the click itself threw and the attempt was
 *    recorded as failed. A network timeout on the click is exactly the case
 *    where Google may have queued the export anyway, so every error path has
 *    to carry that uncertainty forward rather than starting over.
 * 2. An expired auth wait is not a reason to replace a window someone may be
 *    standing in front of. While the session is alive the plan is to resume and
 *    ask for a human; only a dead session allows a fresh attempt.
 * 3. The age of a `queued` record proves nothing about Google's queue. Past the
 *    suppression window the caller has to go and look before asking again.
 */
export function planAttempt(
  state: RequestState,
  now: Date,
  context: PlanContext = {},
): AttemptPlan {
  // A hard blocker is not a dead end. The way out is a read-only look at the
  // queue and the gate: if the human authenticated in the meantime, or the
  // export turns out to exist, the record should say so without anyone editing
  // JSON by hand. A recheck can never fill a form or submit anything.
  if (state.blocker === "submission_uncertain") {
    return recheck("submission_uncertain");
  }

  if (state.phase === "queued") {
    const hours = minutesSince(state.queued_at, now) / 60;
    if (hours < QUEUED_SUPPRESS_HOURS) {
      return { action: "already_queued", reason: "within_cycle" };
    }
    const pendingNow = context.pendingNow;
    if (pendingNow === undefined || pendingNow === null) {
      return { action: "observe_queue", reason: "queued_age_not_proof" };
    }
    return pendingPossiblyYouTubeExports(pendingNow).length > 0
      ? { action: "already_queued", reason: "export_still_building" }
      : { action: "start_new", reason: "cycle_elapsed" };
  }

  if (state.phase === "awaiting_auth") {
    if (state.blocker && !RESUMABLE_BLOCKERS.has(state.blocker)) {
      return recheck(state.blocker);
    }
    const stale =
      minutesSince(state.awaiting_auth_since, now) > AWAITING_AUTH_MAX_MIN;
    if (!stale) {
      return {
        action: "resume_awaiting_auth",
        refillForm: false,
        resubmit: false,
        operatorRecovery: false,
      };
    }
    if (state.attempt?.submitted_at) {
      return { action: "verify_submitted", resubmit: false };
    }
    // Age alone must not close or replace a window that is still open.
    if (context.sessionAlive) {
      return {
        action: "resume_awaiting_auth",
        refillForm: false,
        resubmit: false,
        operatorRecovery: true,
      };
    }
    return { action: "start_new", reason: "auth_wait_expired" };
  }

  // Any unresolved submission, whatever phase it ended up in.
  if (state.attempt?.submitted_at) {
    const stale =
      minutesSince(state.attempt.submitted_at, now) >
      SUBMITTED_UNVERIFIED_MAX_MIN;
    return stale
      ? recheck("submission_uncertain")
      : { action: "verify_submitted", resubmit: false };
  }

  if (state.blocker) return recheck(state.blocker);
  return { action: "start_new", reason: "fresh" };
}

/**
 * Open a fresh attempt. Refuses to discard an attempt that reached "Create
 * export" without ever being confirmed: overwriting it would lose the only
 * record that Google might already be building something.
 */
export function startAttempt(
  state: RequestState,
  input: {
    now: Date;
    attemptId: string;
    pendingBefore: ManageExportObservation[] | null;
  },
): RequestState {
  if (state.attempt?.submitted_at && state.phase !== "queued") {
    throw new Error("unresolved_submission");
  }
  return {
    ...state,
    phase: "idle",
    attempt: {
      attempt_id: input.attemptId,
      started_at: input.now.toISOString(),
      form_filled_at: null,
      submitted_at: null,
      pending_before: input.pendingBefore,
    },
    awaiting_auth_since: null,
    auth_step: null,
    blocker: null,
    queued_at: null,
    queue_evidence: null,
    updated_at: input.now.toISOString(),
    host: os.hostname(),
  };
}

function withAttempt(
  state: RequestState,
  patch: Partial<RequestAttempt>,
  now: Date,
): RequestState {
  if (!state.attempt) throw new Error("no_attempt_in_flight");
  return {
    ...state,
    attempt: { ...state.attempt, ...patch },
    updated_at: now.toISOString(),
  };
}

/**
 * Replace the pre-attempt baseline. Allowed only before a submission: the
 * baseline exists to tell a new queue row from one that was already there, so
 * moving it after the fact would let an old row count as this attempt's work.
 *
 * This is what lets an attempt that parked at an auth gate before it had a
 * usable baseline take one later, once the human has signed in.
 */
export function recordBaseline(
  state: RequestState,
  input: { now: Date; pendingBefore: ManageExportObservation[] },
): RequestState {
  if (!state.attempt) throw new Error("no_attempt_in_flight");
  if (state.attempt.submitted_at) throw new Error("already_submitted");
  return withAttempt(state, { pending_before: input.pendingBefore }, input.now);
}

export function recordFormFilled(
  state: RequestState,
  input: { now: Date },
): RequestState {
  return withAttempt(
    state,
    { form_filled_at: state.attempt?.form_filled_at ?? input.now.toISOString() },
    input.now,
  );
}

export function recordSubmitted(
  state: RequestState,
  input: { now: Date },
): RequestState {
  if (state.attempt?.submitted_at) throw new Error("already_submitted");
  return {
    ...withAttempt(state, { submitted_at: input.now.toISOString() }, input.now),
    phase: "submitted_unverified",
  };
}

export function recordAwaitingAuth(
  state: RequestState,
  input: { now: Date; step: AuthStep; blocker: RequestBlocker | null },
): RequestState {
  return {
    ...state,
    phase: "awaiting_auth",
    auth_step: input.step,
    awaiting_auth_since: state.awaiting_auth_since ?? input.now.toISOString(),
    blocker: input.blocker,
    updated_at: input.now.toISOString(),
  };
}

export function recordQueued(
  state: RequestState,
  input: { now: Date; evidence: QueueEvidence },
): RequestState {
  return {
    ...state,
    phase: "queued",
    awaiting_auth_since: null,
    auth_step: null,
    blocker: null,
    queued_at: input.now.toISOString(),
    queue_evidence: input.evidence,
    last_error: null,
    consecutive_failures: 0,
    updated_at: input.now.toISOString(),
  };
}

export function recordBlocked(
  state: RequestState,
  input: { now: Date; reason: RequestBlocker },
): RequestState {
  return {
    ...state,
    phase: "awaiting_auth",
    awaiting_auth_since: state.awaiting_auth_since ?? input.now.toISOString(),
    blocker: input.reason,
    updated_at: input.now.toISOString(),
  };
}

/**
 * Drop a blocker because an observation said the obstacle is gone — never
 * because time passed. A submitted-but-unproven attempt stays unproven: the
 * phase it returns to is the one its own record justifies.
 */
export function clearBlocker(
  state: RequestState,
  input: { now: Date },
): RequestState {
  return {
    ...state,
    phase: state.attempt?.submitted_at ? "submitted_unverified" : "idle",
    blocker: null,
    awaiting_auth_since: null,
    auth_step: null,
    updated_at: input.now.toISOString(),
  };
}

export function recordFailure(
  state: RequestState,
  input: { now: Date; error: RequestFailure },
): RequestState {
  return {
    ...state,
    phase: "failed",
    last_error: input.error,
    consecutive_failures: state.consecutive_failures + 1,
    updated_at: input.now.toISOString(),
  };
}

/** Record what Google's queue looked like, without attributing it to anyone. */
export function recordQueueObservation(
  state: RequestState,
  input: { now: Date; exports: ManageExportObservation[] },
): RequestState {
  const pending = pendingPossiblyYouTubeExports(input.exports);
  return {
    ...state,
    last_queue_observation: {
      observedAt: input.now.toISOString(),
      pendingYouTube: pending.length > 0,
      exportIds: pending.flatMap((card) => (card.exportId ? [card.exportId] : [])),
    },
    updated_at: input.now.toISOString(),
  };
}

export type AbandonRefusal =
  /** The named attempt is not the one on record. */
  | "no_such_attempt"
  /** It never reached "Create export"; the normal path already restarts it. */
  | "not_submitted"
  | "already_queued"
  /** Google may still be turning the click into an export. */
  | "too_recent"
  /** /manage shows a YouTube export building, which may be this attempt's. */
  | "export_building";

/**
 * Give up on a submission that Google never turned into an export.
 *
 * "Never click Create export twice" holds while a submission might still
 * become an export. A click that bounced to "verify it's you", where nobody
 * ever finished the step, does not: Google builds nothing until the step is
 * done, and the window it was waiting in is gone. The code cannot tell that
 * apart from a slow export by itself, so this takes an operator's word for the
 * one attempt they name, and checks it against a trusted read of /manage taken
 * just now. Any YouTube export still building refuses it.
 */
export function abandonUnconfirmedAttempt(
  state: RequestState,
  input: { now: Date; attemptId: string; exports: ManageExportObservation[] },
): { ok: true; state: RequestState } | { ok: false; reason: AbandonRefusal } {
  const attempt = state.attempt;
  if (!attempt || attempt.attempt_id !== input.attemptId) {
    return { ok: false, reason: "no_such_attempt" };
  }
  if (state.phase === "queued") return { ok: false, reason: "already_queued" };
  if (!attempt.submitted_at) return { ok: false, reason: "not_submitted" };
  if (minutesSince(attempt.submitted_at, input.now) < ABANDON_MIN_AGE_MIN) {
    return { ok: false, reason: "too_recent" };
  }
  if (pendingPossiblyYouTubeExports(input.exports).length > 0) {
    return { ok: false, reason: "export_building" };
  }
  return {
    ok: true,
    state: recordQueueObservation(blankRequestState(), {
      now: input.now,
      exports: input.exports,
    }),
  };
}

export function requestStatePath(): string {
  return `${takeoutPaths().stateDir}/request-state.json`;
}

export type RequestStateRead = {
  present: boolean;
  state: RequestState | null;
  error?: "unreadable";
};

const PHASES = new Set<RequestPhase>([
  "idle",
  "awaiting_auth",
  "submitted_unverified",
  "queued",
  "failed",
]);
const AUTH_STEPS = new Set<AuthStep>([
  "passkey",
  "password",
  "totp",
  "sms",
  "phone_prompt",
  "unknown",
]);
const BLOCKERS = new Set<RequestBlocker>([
  "credential_route_unavailable",
  "native_modal_present",
  "native_modal_driver_unavailable",
  "submission_uncertain",
  "passkey_tap_required",
  "request_state_unreadable",
  "password_rejected",
  "second_factor_required",
  "sign_in_rejected",
]);
const FAILURES = new Set<RequestFailure>([
  "ui_failure",
  "session_cookies_missing",
  "queue_unreadable",
  "password_route_failed",
]);
const STATUSES = new Set(["in_progress", "complete", "unknown"]);

function isInstant(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableInstant(value: unknown): boolean {
  return value === null || isInstant(value);
}

function isCard(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    (card.exportId === null || typeof card.exportId === "string") &&
    typeof card.status === "string" &&
    STATUSES.has(card.status) &&
    Array.isArray(card.products) &&
    card.products.every((product) => typeof product === "string") &&
    (card.createdAtText === null || typeof card.createdAtText === "string")
  );
}

function isAttempt(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Record<string, unknown>;
  if (typeof attempt.attempt_id !== "string" || !isInstant(attempt.started_at)) {
    return false;
  }
  if (
    !isNullableInstant(attempt.form_filled_at) ||
    !isNullableInstant(attempt.submitted_at)
  ) {
    return false;
  }
  // A submission that predates the form being filled is not a record we can
  // reason about, and reasoning about it is the whole job.
  if (attempt.submitted_at !== null && attempt.form_filled_at === null) {
    return false;
  }
  if (attempt.pending_before === null) return true;
  return (
    Array.isArray(attempt.pending_before) && attempt.pending_before.every(isCard)
  );
}

function isQueueEvidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Record<string, unknown>;
  return (
    evidence.source === "takeout_manage_queue" &&
    isInstant(evidence.observedAt) &&
    (evidence.exportId === null || typeof evidence.exportId === "string") &&
    (evidence.createdAtText === null || typeof evidence.createdAtText === "string")
  );
}

function isQueueSnapshot(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    isInstant(snapshot.observedAt) &&
    typeof snapshot.pendingYouTube === "boolean" &&
    Array.isArray(snapshot.exportIds) &&
    snapshot.exportIds.every((id) => typeof id === "string")
  );
}

/**
 * Validate the whole record, not just its version.
 *
 * A half-written or hand-edited file is the one input that can do real damage
 * here: `{"schema":1,"phase":"queued"}` would suppress every request for days
 * while claiming an export exists, and `{"phase":"idle"}` next to a real
 * submission would authorise a second one. Neither is a state this machine can
 * reason about, so both are rejected outright and the caller fails closed.
 */
function validateRequestState(value: unknown): RequestState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (state.schema !== 1) return null;
  if (typeof state.phase !== "string" || !PHASES.has(state.phase as RequestPhase)) {
    return null;
  }
  if (state.attempt !== null && !isAttempt(state.attempt)) return null;
  if (!isNullableInstant(state.awaiting_auth_since)) return null;
  if (
    state.auth_step !== null &&
    !(typeof state.auth_step === "string" && AUTH_STEPS.has(state.auth_step as AuthStep))
  ) {
    return null;
  }
  if (
    state.blocker !== null &&
    !(typeof state.blocker === "string" && BLOCKERS.has(state.blocker as RequestBlocker))
  ) {
    return null;
  }
  if (!isNullableInstant(state.queued_at)) return null;
  if (state.queue_evidence !== null && !isQueueEvidence(state.queue_evidence)) {
    return null;
  }
  if (
    state.last_error !== null &&
    !(typeof state.last_error === "string" && FAILURES.has(state.last_error as RequestFailure))
  ) {
    return null;
  }
  if (
    typeof state.consecutive_failures !== "number" ||
    !Number.isInteger(state.consecutive_failures) ||
    state.consecutive_failures < 0
  ) {
    return null;
  }
  if (!isQueueSnapshot(state.last_queue_observation)) return null;
  if (!isInstant(state.updated_at) || typeof state.host !== "string") return null;

  const phase = state.phase as RequestPhase;
  // Claiming success needs the evidence that justified it.
  if (phase === "queued" && !(state.queued_at && state.queue_evidence)) return null;
  // Claiming an attempt is in flight needs the attempt.
  if (
    (phase === "awaiting_auth" || phase === "submitted_unverified") &&
    state.attempt === null
  ) {
    return null;
  }
  if (phase === "submitted_unverified" && !(state.attempt as RequestAttempt).submitted_at) {
    return null;
  }
  return state as unknown as RequestState;
}

/**
 * Read the request record. Absence and corruption are reported, never
 * smoothed into a default: "no file here" and "idle" are different facts, and
 * on a host that never runs requests only the first one is true.
 */
export function readRequestState(): RequestStateRead {
  const file = requestStatePath();
  if (!fs.existsSync(file)) return { present: false, state: null };
  try {
    const validated = validateRequestState(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    return validated
      ? { present: true, state: validated }
      : { present: true, state: null, error: "unreadable" };
  } catch {
    return { present: true, state: null, error: "unreadable" };
  }
}

export function writeRequestState(state: RequestState): void {
  const { stateDir } = takeoutPaths();
  fs.mkdirSync(stateDir, { recursive: true });
  const file = requestStatePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
