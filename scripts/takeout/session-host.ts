/**
 * Owns the approval window for as long as a person might need it.
 *
 * The old approval path owned the browser from inside the CLI process, so its
 * 20-minute timeout closed the window — the one thing someone standing in front
 * of a passkey prompt cannot afford. Three rules follow from that:
 *
 *   1. Ownership is claimed before the browser is launched, with a mutex that
 *      no second process can slip past. Two windows driving one Takeout form is
 *      the duplicate this design exists to prevent.
 *   2. No timeout and no blocker closes the window. When the polling deadline
 *      passes, or Google wants something only a person can give, this process
 *      stops polling and holds the window open until it is explicitly released.
 *   3. It closes the window on exactly three signals: the export is confirmed
 *      queued, the person closed the window themselves, or a release was asked
 *      for (the release sentinel).
 *   4. Holding is not the end. Someone who signs in by hand can ask the same
 *      holder to carry on, in the same window, with the resume sentinel — which
 *      `approve.ts` writes whenever it attaches to a live window.
 *
 * Launched detached by `approve.ts`, or run directly for an operator session:
 *   npx tsx scripts/takeout/session-host.ts [--deadline <min>] [--poll <sec>]
 *
 * Give up on a click Google never turned into an export, then start afresh in
 * the same window:  --retry-unconfirmed <attempt-id>  (see `request-state.ts`)
 *
 * Resume it with:   touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.resume"
 * Release it with Ctrl-C, or:
 *                   touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.release"
 *
 * Exit codes: 0 = export confirmed queued · 1 = cookies missing ·
 * 2 = argument error or crash · 3 = another holder owns the window ·
 * 4 = released while still waiting for a person.
 */
import type { Page } from "playwright";
import { pathToFileURL } from "url";

import { close, getPage, hasGoogleSessionCookies } from "./browser";
import { parseCliArgs, positiveNumber } from "./cli-args";
import { exitWhenDone } from "./entry";
import { acquireNamedLock } from "./lock";
import {
  type DismissOutcome,
  type NativeModalDriver,
  type OwnedBrowser,
  dismissOwnedModal,
  resolveModalDriver,
  resolveOwnedBrowser,
} from "./native-modal";
import { pageFlowDeps } from "./page-wiring";
import { openPasswordRoute } from "./password-route";
import { trustedQueueExports } from "./queue-evidence";
import {
  type FlowOutcome,
  type RequestFlowDeps,
  runRequestAttempt,
} from "./request-flow";
import {
  type AbandonRefusal,
  type RequestBlocker,
  abandonUnconfirmedAttempt,
  blankRequestState,
  readRequestState,
  recordBlocked,
  recordFailure,
  writeRequestState,
} from "./request-state";
import {
  SessionOwnershipError,
  claimSessionOwnership,
  clearReleaseSentinel,
  clearResumeSentinel,
  releaseRequested,
  requestRelease,
  resumeRequested,
} from "./session";
import {
  chooseEnterPassword,
  clickTryAnotherWay,
  observeManageQueue,
  passwordFieldVisible,
} from "./takeout-dom";

const USAGE = `Usage: tsx scripts/takeout/session-host.ts [options]
Owns the headed approval window. No timeout closes it.

  --deadline <min>  How long to keep polling for a result (default 360).
                    When it passes the window stays open; only a release closes it.
  --poll <sec>      Seconds between polls (default 30).
  --retry-unconfirmed <attempt-id>
                    Give up on that attempt's "Create export" click, which
                    Google never turned into an export, and start a new one.
                    Refused unless /manage shows no YouTube export building.
  --headless        Run the window headless. For tests; a person cannot act in it.
  --help            Show this and exit.

Release the window with:
  touch "$YOUTUBE_TAKEOUT_STATE_DIR/request-session.release"`;

/**
 * Consecutive unreadable queue reads before the holder records the failure and
 * stops polling. One or two can be a page mid-navigation; five in a row is a
 * page this code cannot read, and polling it forever writes nothing anyone
 * sees (the first live holder, 2026-10-05).
 */
export const UNOBSERVED_LIMIT = 5;

/** Outcomes that mean the window has done its job and can close. */
const COMPLETE: Partial<Record<FlowOutcome["kind"], number>> = {
  queued: 0,
  already_queued: 3,
  pending_export_exists: 3,
};

export function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

export type ApprovalSessionDeps = {
  deps: RequestFlowDeps;
  /** Seconds between polls. */
  pollMs: number;
  /** When to stop polling. Does not close the window. */
  deadlineAt: number;
  /** How much more polling a resume grants. */
  resumeWindowMs: number;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  /** The person closed the window themselves. */
  windowClosed: () => boolean;
  released: () => boolean;
  /** Someone asked the holder to carry on in this same window. */
  resumeRequested: () => boolean;
  consumeResume: () => void;
  /**
   * Called when an attempt parks at a sign-in step. Returns "retry" when the
   * attempt should run again at once instead of after a poll. Absent unless an
   * operator enabled the native adapter, so the person at the window handles
   * Google's step by default.
   */
  onAuthWait?: (
    outcome: Extract<FlowOutcome, { kind: "awaiting_auth" }>,
  ) => Promise<"retry" | "wait">;
};

export type ApprovalSessionResult = {
  code: number;
  reason: "queued" | "complete" | "released" | "window_closed" | "retry_refused";
};

/**
 * Poll the shared attempt driver until there is nothing left to wait for.
 *
 * A blocker or an expired deadline stops the polling and returns `held`: the
 * caller keeps the window open and waits for a release. Only a confirmed export,
 * a closed window or an explicit release ends the session.
 */
export async function runApprovalSession(
  options: ApprovalSessionDeps,
): Promise<ApprovalSessionResult> {
  let holding = false;
  let unobserved = 0;
  let deadlineAt = options.deadlineAt;
  for (;;) {
    // Ending without a confirmed export is never a success, however it ended.
    if (options.released()) return { code: 4, reason: "released" };
    if (options.windowClosed()) return { code: 4, reason: "window_closed" };

    // A holder that stopped polling is waiting, not finished. Consuming the
    // sentinel makes a resume one request rather than a standing instruction,
    // and it reuses this window: nothing is launched and nothing is refilled.
    if (options.resumeRequested()) {
      options.consumeResume();
      if (holding) {
        holding = false;
        unobserved = 0;
        deadlineAt = options.now() + options.resumeWindowMs;
        emit("host_resumed", { polling_until_ms: options.resumeWindowMs });
      }
    }

    if (!holding && options.now() >= deadlineAt) {
      emit("host_deadline_reached");
      holding = true;
    }

    if (!holding) {
      // The mutex is held per attempt, not for the window's lifetime: a window
      // waiting hours on a person must not block the scheduled headless path
      // from looking at the queue.
      let release: (() => void) | undefined;
      try {
        release = acquireNamedLock("request.lock");
      } catch {
        emit("host_lock_busy");
        await options.wait(options.pollMs);
        continue;
      }
      let outcome: FlowOutcome;
      try {
        outcome = await runRequestAttempt(options.deps);
      } finally {
        release();
      }
      emit("host_outcome", outcome);

      const complete = COMPLETE[outcome.kind];
      if (complete !== undefined) {
        return { code: complete, reason: complete === 0 ? "queued" : "complete" };
      }

      if (outcome.kind === "awaiting_auth" && options.onAuthWait) {
        if ((await options.onAuthWait(outcome)) === "retry") continue;
      }

      unobserved = outcome.kind === "queue_unobserved" ? unobserved + 1 : 0;
      if (unobserved >= UNOBSERVED_LIMIT) {
        // The record is the only place approve.ts and the status look. A read
        // of it that fails is left alone rather than overwritten.
        const read = options.deps.loadState();
        if (read.state || !read.present) {
          options.deps.saveState(
            recordFailure(read.state ?? blankRequestState(), {
              now: options.deps.now(),
              error: "queue_unreadable",
            }),
          );
        }
        emit("host_holding", { reason: "queue_unobserved" });
        holding = true;
      }

      if (outcome.kind === "blocked" || outcome.kind === "failed") {
        // Whatever this is, it needs a person, and closing the window would
        // take away the thing they need to act in.
        emit("host_holding", { reason: outcome.kind });
        holding = true;
      }
    }

    await options.wait(options.pollMs);
  }
}

export type AuthWaitHook = NonNullable<ApprovalSessionDeps["onAuthWait"]>;

/**
 * The opt-in native route: clear Chrome's passkey dialog so a person can type
 * their password. Only at the passkey step, because that is where the dialog
 * appears, and only once per holder: the session polls every few seconds, and
 * clicking "Try another way" again would pull the page out from under someone
 * who is already typing (seen live 2026-10-05 at a 3-second poll).
 */
export function nativeRouteHook(
  run: () => Promise<RequestBlocker | null>,
): AuthWaitHook {
  let tried = false;
  return async (outcome) => {
    if (tried || outcome.step !== "passkey") return "wait";
    tried = true;
    emit("host_password_route", { blocker: await run() });
    return "wait";
  };
}

export async function main(): Promise<number> {
  // Arguments first: before any cookie is read, any state written, or any
  // browser launched.
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2), {
      flags: ["--headless"],
      values: ["--deadline", "--poll", "--retry-unconfirmed"],
      retired: ["--timeout", "--no-headed", "--dry-run"],
      usage: USAGE,
    });
  } catch (error) {
    emit("host_invalid_arguments", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    console.error(USAGE);
    return 2;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }

  const deadlineMin = positiveNumber(parsed.values.get("--deadline"), 360);
  const pollSec = positiveNumber(parsed.values.get("--poll"), 30);
  const headless = parsed.flags.has("--headless");
  const retryId = parsed.values.get("--retry-unconfirmed") ?? null;

  if (!hasGoogleSessionCookies()) {
    emit("host_session_missing");
    return 1;
  }

  // A retry names one attempt. Naming any other is refused before a window
  // opens; the queue check that can also refuse it needs the page.
  if (retryId !== null && readRequestState().state?.attempt?.attempt_id !== retryId) {
    emit("host_retry_unconfirmed", { ok: false, reason: "no_such_attempt" });
    return 2;
  }

  // Ownership before the browser: claiming it afterwards would let two
  // processes each open a window and then argue about who owns it.
  let claim;
  try {
    claim = claimSessionOwnership({
      now: new Date(),
      mode: headless ? "headless" : "headed",
      attemptId: readRequestState().state?.attempt?.attempt_id ?? null,
    });
  } catch (error) {
    if (error instanceof SessionOwnershipError) {
      emit("host_already_owned", { reason: error.reason });
      return 3;
    }
    throw error;
  }
  if (claim.tookOver) emit("host_took_over_dead_session");
  clearReleaseSentinel();
  // Ctrl-C or a polite kill is a release: the loop notices on its next turn,
  // gives up ownership, and closes the window, instead of leaving a dead
  // holder's claim for the next run to take over.
  const askRelease = () => requestRelease();
  process.once("SIGINT", askRelease);
  process.once("SIGTERM", askRelease);

  const page = await getPage({ headless });
  emit("host_started", {
    deadline_min: deadlineMin,
    poll_sec: pollSec,
    mode: claim.record.mode,
  });

  clearResumeSentinel();
  let windowClosed = false;
  page.on("close", () => {
    windowClosed = true;
  });

  // The window closes only here, and only for a reason `runApprovalSession`
  // returns with, or for a refused retry, which has driven nothing.
  const finish = async (result: ApprovalSessionResult): Promise<number> => {
    emit("host_finished", result);
    claim.release();
    clearReleaseSentinel();
    clearResumeSentinel();
    await close().catch(() => undefined);
    return result.code;
  };

  if (retryId !== null) {
    const retried = await retryUnconfirmed(page, retryId);
    emit("host_retry_unconfirmed", retried);
    if (!retried.ok) return await finish({ code: 2, reason: "retry_refused" });
  }

  // Bind the browser identity and its pre-modal windows now, while nothing has
  // raised a dialog. Off unless an operator enabled the adapter.
  const modalDriver = resolveModalDriver(process.env);
  const owned = modalDriver
    ? await resolveOwnedBrowser({
        context: page.context(),
        driver: modalDriver,
      })
    : null;
  if (modalDriver) {
    emit("host_native_binding", {
      bound: owned !== null,
      app_name: owned?.appName ?? null,
      baseline_windows: owned?.windowIds.length ?? 0,
    });
  }

  const onAuthWait = modalDriver
    ? nativeRouteHook(() => runPasswordRoute(page, { driver: modalDriver, owned }))
    : undefined;

  const result = await runApprovalSession({
    pollMs: pollSec * 1000,
    deadlineAt: Date.now() + deadlineMin * 60_000,
    resumeWindowMs: deadlineMin * 60_000,
    now: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    windowClosed: () => windowClosed || page.isClosed(),
    released: releaseRequested,
    resumeRequested,
    consumeResume: clearResumeSentinel,
    onAuthWait,
    deps: pageFlowDeps({
      openPage: () => Promise.resolve(page),
      // This process owns a live window, and must say so: reporting "none"
      // would let an aged-out wait reset and start a fresh attempt.
      sessionView: () => ({ kind: "alive", record: claim.record }),
    }),
  });

  return await finish(result);
}

/**
 * `--retry-unconfirmed`: the operator says the named attempt's click never
 * became an export. Read /manage now, under the request mutex, and give the
 * attempt up only if the queue agrees. Nothing is filled or clicked here; the
 * session that follows starts the new attempt, once.
 */
async function retryUnconfirmed(
  page: Page,
  attemptId: string,
): Promise<
  | { ok: true; abandoned: string }
  | { ok: false; reason: AbandonRefusal | "lock_busy" | "request_state_unreadable" | "queue_unreadable" }
> {
  let release: () => void;
  try {
    release = acquireNamedLock("request.lock");
  } catch {
    return { ok: false, reason: "lock_busy" };
  }
  try {
    const read = readRequestState();
    if (!read.state) {
      return { ok: false, reason: read.present ? "request_state_unreadable" : "no_such_attempt" };
    }
    const exports = trustedQueueExports(await observeManageQueue(page));
    if (!exports) return { ok: false, reason: "queue_unreadable" };
    const result = abandonUnconfirmedAttempt(read.state, {
      now: new Date(),
      attemptId,
      exports,
    });
    if (!result.ok) return result;
    writeRequestState(result.state);
    return { ok: true, abandoned: attemptId };
  } finally {
    release();
  }
}

/**
 * The reviewed, opt-in password route.
 *
 * Google's native "No passkeys available" window swallows the click on the
 * DOM's "Try another way". Clearing it needs the accessibility layer, which is
 * off unless an operator turned it on and the browser identity could be bound
 * to a live process. Without both, this blocks and says so rather than
 * pretending the password route works. It never enters a credential under any
 * circumstances: reaching the prompt is where it stops.
 */
async function runPasswordRoute(
  page: unknown,
  native: { driver: NativeModalDriver; owned: OwnedBrowser | null },
): Promise<RequestBlocker | null> {
  const dismiss = async (): Promise<DismissOutcome> =>
    native.owned
      ? await dismissOwnedModal(native.driver, native.owned)
      : { kind: "driver_disabled" };

  const result = await openPasswordRoute({
    dismissNativeModal: dismiss,
    clickTryAnotherWay: () => clickTryAnotherWay(page as never),
    chooseEnterPassword: () => chooseEnterPassword(page as never),
    passwordFieldVisible: () => passwordFieldVisible(page as never),
  });

  const blocker =
    result.kind === "blocked"
      ? result.reason
      : result.kind === "password_prompt_ready"
        ? result.blocker
        : null;
  if (blocker) {
    const read = readRequestState();
    if (read.state) {
      writeRequestState(recordBlocked(read.state, { now: new Date(), reason: blocker }));
    }
  }
  return blocker;
}

/**
 * Run only when this file is the process entry. Importing it — from a test, or
 * from another script — must not start a browser or claim a session.
 */
export const done =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
    ? exitWhenDone(main, async (error) => {
        emit("host_crashed", {
          reason: error instanceof Error ? error.name : "unknown",
        });
        await close().catch(() => undefined);
      })
    : Promise.resolve();
