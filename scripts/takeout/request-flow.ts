/**
 * The one driver both request paths share.
 *
 * `request.ts` (headless, scheduled) and `approve.ts` (headed, human present)
 * used to each carry their own copy of "fill the form, click the button, hope".
 * They now hand their browser steps to this function, which owns the decisions:
 * what the recorded state allows, whether anything actually queued, and what to
 * write down afterwards. Every browser interaction arrives as a dependency, so
 * the decisions are testable without a window.
 *
 * Four invariants are worth stating out loud, because all four were violated
 * before:
 *
 *   - "Create export" is clicked at most once per attempt, and the submission is
 *     written down *before* the click. A click that throws on a navigation
 *     timeout may still have queued the export, so the uncertainty has to
 *     survive the error rather than be re-rolled on the next run.
 *   - An export is `queued` only when a parsed /manage card says so. Not a
 *     click, not a URL, not a zip that showed up in Drive.
 *   - A queue we could not read is not an empty queue. Every path that needs
 *     the list either gets a trusted parse or does nothing at all.
 *   - A step that fails because Google wants a human is an auth wait, not a UI
 *     failure. `detectAuthGate` is consulted on the error path too, so an auth
 *     prompt during form filling parks the attempt instead of burning it.
 */
import {
  type ManageExportObservation,
  type Observation,
  type QueueEvidence,
  type QueueUnconfirmedReason,
  confirmQueueEvidence,
  pendingPossiblyYouTubeExports,
  trustedQueueExports,
} from "./queue-evidence";
import {
  type AuthStep,
  type RequestBlocker,
  type RequestFailure,
  type RequestState,
  type RequestStateRead,
  blankRequestState,
  clearBlocker,
  planAttempt,
  recordBaseline,
  recordAwaitingAuth,
  recordBlocked,
  recordFailure,
  recordFormFilled,
  recordQueueObservation,
  recordQueued,
  recordSubmitted,
  startAttempt,
} from "./request-state";
import { type SessionView } from "./session";

/** Opaque to the flow: whatever the adapter needs to act on the page. */
export type FlowPage = object;

export type AuthGateObservation = {
  step: AuthStep;
  blocker: RequestBlocker | null;
};

export type PageRequest = {
  /** A live window already exists; attach to it rather than launching one. */
  attach: boolean;
  /** Only observation is allowed. No form, no submission, ever. */
  readOnly: boolean;
};

export type RequestFlowDeps = {
  now: () => Date;
  newAttemptId: () => string;
  loadState: () => RequestStateRead;
  saveState: (state: RequestState) => void;
  sessionView: () => SessionView;
  openPage: (request: PageRequest) => Promise<FlowPage>;
  fillForm: (page: FlowPage) => Promise<void>;
  clickCreateExport: (page: FlowPage) => Promise<void>;
  observeQueue: (page: FlowPage) => Promise<Observation>;
  detectAuthGate: (page: FlowPage) => Promise<AuthGateObservation | null>;
  /** Whether the page is already on the delivery step, ready to submit. */
  formReady: (page: FlowPage) => Promise<boolean>;
};

export type QueueUnobservedReason =
  | "not_a_queue_source"
  | "unreadable"
  | "auth_gate"
  | "not_takeout"
  | "missing";

export type FlowOutcome =
  | { kind: "queued"; evidence: QueueEvidence }
  | {
      kind: "awaiting_auth";
      step: AuthStep;
      blocker: RequestBlocker | null;
      operatorRecovery: boolean;
    }
  | { kind: "submission_unverified"; reason: QueueUnconfirmedReason }
  | { kind: "already_queued"; reason: "within_cycle" | "export_still_building" }
  | { kind: "pending_export_exists"; exportIds: string[] }
  | { kind: "queue_unobserved"; reason: QueueUnobservedReason }
  | { kind: "blocked"; reason: RequestBlocker }
  | { kind: "deferred"; reason: "foreign_host" | "unreadable_session" }
  | { kind: "failed"; error: RequestFailure };

function unobserved(observation: Observation): FlowOutcome {
  return {
    kind: "queue_unobserved",
    reason:
      observation.source === "unknown" ? observation.reason : "not_a_queue_source",
  };
}

/** Blockers a person has to clear by changing something, not by looking. */
const STICKY_BLOCKERS = new Set<RequestBlocker>([
  "password_rejected",
  "sign_in_rejected",
]);

export async function runRequestAttempt(
  deps: RequestFlowDeps,
): Promise<FlowOutcome> {
  const session = deps.sessionView();
  if (session.kind === "foreign" || session.kind === "unreadable") {
    // Another machine, or a record we cannot read. Either way there may be a
    // window open that this process knows nothing about.
    return {
      kind: "deferred",
      reason: session.kind === "foreign" ? "foreign_host" : "unreadable_session",
    };
  }

  const read = deps.loadState();
  if (read.present && !read.state) {
    // Neither "idle" nor "queued" can be assumed from a record we cannot
    // parse, and both assumptions are dangerous. Leave the file for an
    // operator to look at rather than overwriting the evidence.
    return { kind: "blocked", reason: "request_state_unreadable" };
  }

  const attach = session.kind === "alive";
  let state = read.state ?? blankRequestState();
  let now = deps.now();
  let plan = planAttempt(state, now, { sessionAlive: attach });

  if (plan.action === "already_queued") {
    return { kind: "already_queued", reason: plan.reason };
  }

  let page: FlowPage | undefined;
  try {
    if (plan.action === "recheck_blocked") {
      page = await deps.openPage({ attach, readOnly: true });
      return await recheckBlocked(deps, state, now, page, plan.reason);
    }

    if (plan.action === "observe_queue") {
      // An old `queued` record says nothing about Google's queue today, so go
      // and look before deciding whether to ask for another export.
      page = await deps.openPage({ attach, readOnly: true });
      const observation = await deps.observeQueue(page);
      const exports = trustedQueueExports(observation);
      if (!exports) return unobserved(observation);
      state = recordQueueObservation(state, { now, exports });
      deps.saveState(state);
      now = deps.now();
      plan = planAttempt(state, now, { sessionAlive: attach, pendingNow: exports });
      if (plan.action === "already_queued") {
        return { kind: "already_queued", reason: plan.reason };
      }
      if (plan.action !== "start_new") {
        return { kind: "failed", error: "queue_unreadable" };
      }
      page = await deps.openPage({ attach, readOnly: false });
      return await startFreshAttempt(deps, state, now, page, exports);
    }

    if (plan.action === "resume_awaiting_auth") {
      const submitted = Boolean(state.attempt?.submitted_at);
      page = await deps.openPage({ attach, readOnly: submitted });

      // Ask about the gate before anything else. Reading the queue means
      // navigating to /manage, which would walk away from a sign-in someone
      // may be halfway through.
      const gate = await deps.detectAuthGate(page);
      if (gate) {
        const parked = recordAwaitingAuth(state, {
          now,
          step: gate.step,
          blocker: gate.blocker,
        });
        deps.saveState(parked);
        return {
          kind: "awaiting_auth",
          step: gate.step,
          blocker: gate.blocker,
          operatorRecovery: plan.operatorRecovery,
        };
      }

      // The gate is gone. What happens next depends on how far the attempt had
      // got: a submitted attempt can only be verified, while one that never
      // submitted is now free to finish — that is the whole point of waiting.
      if (submitted) {
        const observation = await deps.observeQueue(page);
        const verdict = confirmQueueEvidence({
          observation,
          pendingBefore: state.attempt?.pending_before ?? null,
        });
        if (verdict.confirmed) {
          deps.saveState(recordQueued(state, { now, evidence: verdict.evidence }));
          return { kind: "queued", evidence: verdict.evidence };
        }
        const exports = trustedQueueExports(observation);
        if (!exports) return unobserved(observation);
        deps.saveState({
          ...recordQueueObservation(state, { now, exports }),
          phase: "submitted_unverified",
        });
        return { kind: "submission_unverified", reason: verdict.reason };
      }

      return await finishUnsubmittedAttempt(deps, state, now, page);
    }

    if (plan.action === "verify_submitted") {
      page = await deps.openPage({ attach, readOnly: true });
      const observation = await deps.observeQueue(page);
      const verdict = confirmQueueEvidence({
        observation,
        pendingBefore: state.attempt?.pending_before ?? null,
      });
      if (verdict.confirmed) {
        deps.saveState(recordQueued(state, { now, evidence: verdict.evidence }));
        return { kind: "queued", evidence: verdict.evidence };
      }
      const exports = trustedQueueExports(observation);
      if (!exports) return unobserved(observation);
      deps.saveState({
        ...recordQueueObservation(state, { now, exports }),
        phase: "submitted_unverified",
      });
      return { kind: "submission_unverified", reason: verdict.reason };
    }

    page = await deps.openPage({ attach, readOnly: false });

    // A gate on the way in is an auth wait, not a failed tick and not an empty
    // queue. Park it explicitly so the next run can resume rather than restart.
    const gate = await deps.detectAuthGate(page);
    if (gate) {
      const opened = state.attempt
        ? state
        : startAttempt(state, {
            now,
            attemptId: deps.newAttemptId(),
            pendingBefore: null,
          });
      deps.saveState(
        recordAwaitingAuth(opened, {
          now,
          step: gate.step,
          blocker: gate.blocker,
        }),
      );
      return {
        kind: "awaiting_auth",
        step: gate.step,
        blocker: gate.blocker,
        operatorRecovery: false,
      };
    }

    const baseline = await deps.observeQueue(page);
    const exports = trustedQueueExports(baseline);
    // Without a trusted baseline there is no way to tell a new card from an old
    // one later, so the attempt does not start at all.
    if (!exports) return unobserved(baseline);
    return await startFreshAttempt(deps, state, now, page, exports);
  } catch {
    return await recordStepFailure(deps, now, page);
  }
}

/**
 * Read-only resolution of a blocker. Google's gate may have been satisfied by
 * hand since the block was recorded, and the export may even exist by now; both
 * are findings an observation can make. Nothing here fills a form or submits.
 */
async function recheckBlocked(
  deps: RequestFlowDeps,
  state: RequestState,
  now: Date,
  page: FlowPage,
  reason: RequestBlocker,
): Promise<FlowOutcome> {
  const observation = await deps.observeQueue(page);
  const verdict = confirmQueueEvidence({
    observation,
    pendingBefore: state.attempt?.pending_before ?? null,
  });
  if (verdict.confirmed) {
    deps.saveState(recordQueued(state, { now, evidence: verdict.evidence }));
    return { kind: "queued", evidence: verdict.evidence };
  }

  const exports = trustedQueueExports(observation);
  // A recheck that could not see the queue has learned nothing, so the answer
  // is the blocker that already stands, not a report about the queue.
  if (!exports) return { kind: "blocked", reason };

  const gate = await deps.detectAuthGate(page);
  if (gate) {
    // Still gated. Record what the gate says now and stay blocked — except
    // that a refused password or a refused browser outranks whatever the page
    // shows next, because forgetting it is how the same password gets typed
    // again.
    const blocker = STICKY_BLOCKERS.has(reason) ? reason : gate.blocker ?? reason;
    deps.saveState(
      recordBlocked(recordQueueObservation(state, { now, exports }), {
        now,
        reason: blocker,
      }),
    );
    return { kind: "blocked", reason: blocker };
  }

  const cleared = clearBlocker(
    recordQueueObservation(state, { now, exports }),
    { now },
  );
  deps.saveState(cleared);
  return cleared.phase === "submitted_unverified"
    ? { kind: "submission_unverified", reason: verdict.reason }
    : { kind: "queue_unobserved", reason: "not_a_queue_source" };
}

/**
 * Turn a thrown step into the truest state we can justify. If Google is asking
 * for a human, that is an auth wait even though a step threw; the generic
 * failure is for everything else. The attempt keeps its `submitted_at` either
 * way, so uncertainty is never re-rolled into a second submission.
 */
async function recordStepFailure(
  deps: RequestFlowDeps,
  now: Date,
  page: FlowPage | undefined,
): Promise<FlowOutcome> {
  const current = deps.loadState().state ?? blankRequestState();
  if (page !== undefined && current.attempt) {
    try {
      const gate = await deps.detectAuthGate(page);
      if (gate) {
        deps.saveState(
          recordAwaitingAuth(current, {
            now,
            step: gate.step,
            blocker: gate.blocker,
          }),
        );
        return {
          kind: "awaiting_auth",
          step: gate.step,
          blocker: gate.blocker,
          operatorRecovery: false,
        };
      }
    } catch {
      /* The gate probe is best effort; fall through to the failure. */
    }
  }
  // Child errors and page content can carry session detail, so only the
  // controlled failure code is recorded.
  deps.saveState(recordFailure(current, { now, error: "ui_failure" }));
  return { kind: "failed", error: "ui_failure" };
}

/**
 * Fill the form and submit once, starting from a trusted baseline snapshot of
 * the queue. The snapshot does double duty: it suppresses a duplicate request
 * when Google is already building something, and it is what later tells a new
 * card apart from one that was already there.
 */
async function startFreshAttempt(
  deps: RequestFlowDeps,
  previous: RequestState,
  now: Date,
  page: FlowPage,
  baselineExports: ManageExportObservation[],
): Promise<FlowOutcome> {
  const suppressed = suppressDuplicate(deps, previous, now, baselineExports);
  if (suppressed) return suppressed;

  const state = recordQueueObservation(
    startAttempt(previous, {
      now,
      attemptId: deps.newAttemptId(),
      pendingBefore: baselineExports,
    }),
    { now, exports: baselineExports },
  );
  deps.saveState(state);
  return await fillAndSubmit(deps, state, now, page);
}

/**
 * Carry an attempt that parked before submitting over the finish line, now that
 * the gate is clear. It may have a stale baseline or none at all — it parked
 * before it could take one — so the baseline is taken here, before anything is
 * submitted, and duplicate suppression gets its say first.
 */
async function finishUnsubmittedAttempt(
  deps: RequestFlowDeps,
  parked: RequestState,
  now: Date,
  page: FlowPage,
): Promise<FlowOutcome> {
  const observation = await deps.observeQueue(page);
  const exports = trustedQueueExports(observation);
  if (!exports) return unobserved(observation);

  const suppressed = suppressDuplicate(deps, parked, now, exports);
  if (suppressed) return suppressed;

  const state = recordQueueObservation(
    recordBaseline(parked, { now, pendingBefore: exports }),
    { now, exports },
  );
  deps.saveState(state);
  return await fillAndSubmit(deps, state, now, page);
}

/** An export Google is already building is never a reason to queue another. */
function suppressDuplicate(
  deps: RequestFlowDeps,
  state: RequestState,
  now: Date,
  exports: ManageExportObservation[],
): FlowOutcome | null {
  const alreadyBuilding = pendingPossiblyYouTubeExports(exports);
  if (alreadyBuilding.length === 0) return null;
  // Not ours to claim, but certainly not a reason to queue a second one.
  deps.saveState(recordQueueObservation(state, { now, exports }));
  return {
    kind: "pending_export_exists",
    exportIds: alreadyBuilding.flatMap((card) =>
      card.exportId ? [card.exportId] : [],
    ),
  };
}

/**
 * The only code path that may submit, and it submits once.
 *
 * The form is filled only when the page is not already on the delivery step —
 * after an auth redirect it will not be, and after a resume on the same page it
 * will. Either way the submission is written down before the click, so a click
 * that throws leaves an attempt that can only be verified afterwards.
 */
async function fillAndSubmit(
  deps: RequestFlowDeps,
  initial: RequestState,
  now: Date,
  page: FlowPage,
): Promise<FlowOutcome> {
  let state = initial;
  if (!(await deps.formReady(page))) {
    await deps.fillForm(page);
    state = recordFormFilled(state, { now });
    deps.saveState(state);
  }

  const gate = await deps.detectAuthGate(page);
  if (gate) {
    state = recordAwaitingAuth(state, {
      now,
      step: gate.step,
      blocker: gate.blocker,
    });
    deps.saveState(state);
    return {
      kind: "awaiting_auth",
      step: gate.step,
      blocker: gate.blocker,
      operatorRecovery: false,
    };
  }

  // After this line, no code path may click "Create export" again for this
  // attempt, whatever happens next.
  state = recordSubmitted(recordFormFilled(state, { now }), { now });
  deps.saveState(state);
  await deps.clickCreateExport(page);

  // The gate comes first again: reading the queue navigates, and a challenge
  // raised by the submission is exactly what must not be navigated away from.
  const afterGate = await deps.detectAuthGate(page);
  if (afterGate) {
    deps.saveState(
      recordAwaitingAuth(state, {
        now,
        step: afterGate.step,
        blocker: afterGate.blocker,
      }),
    );
    return {
      kind: "awaiting_auth",
      step: afterGate.step,
      blocker: afterGate.blocker,
      operatorRecovery: false,
    };
  }

  const observation = await deps.observeQueue(page);
  const verdict = confirmQueueEvidence({
    observation,
    pendingBefore: state.attempt?.pending_before ?? null,
  });
  if (verdict.confirmed) {
    deps.saveState(recordQueued(state, { now, evidence: verdict.evidence }));
    return { kind: "queued", evidence: verdict.evidence };
  }

  const exports = trustedQueueExports(observation);
  if (!exports) return unobserved(observation);
  deps.saveState(recordQueueObservation(state, { now, exports }));
  return { kind: "submission_unverified", reason: verdict.reason };
}
