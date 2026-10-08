/**
 * Ask for the headed approval window, then wait a bounded time for it — without
 * owning it.
 *
 * The window belongs to `session-host.ts`, launched detached. That is the fix
 * for the old behaviour: this process timing out, being interrupted, or having
 * its terminal closed no longer takes the browser with it.
 *
 * Two things this is careful about, because both would be lies:
 *
 *   - An export that was already queued before this ran is reported as history,
 *     with its own timestamp. Calling it acceptance would credit this run, and
 *     the person's tap, with work that was already done.
 *   - "The window is still open" is said only after the session record confirms
 *     a live holder. A holder that failed to start is reported as exactly that.
 *
 * Attaching to a live window also asks its holder to resume, which is how a
 * person who completed a sign-in by hand gets the attempt moving again without
 * a second window.
 *
 * Run with: npx tsx scripts/takeout/approve.ts
 *   --wait <min>      How long to watch for a result (default 20). Does not
 *                     bound the window's life.
 *   --deadline <min>  How long the window itself stays open (default 360).
 *   --poll <sec>      Seconds between checks (default 10).
 *   --no-launch       Watch an existing session; never start one.
 *   --retry-unconfirmed <attempt-id>
 *                     Give up on that attempt's unverified click and start a
 *                     new one in the new window (see `abandonUnconfirmedAttempt`).
 *   --help            Show usage and exit.
 *
 * The window's own log goes to request-session.log in the state directory.
 *
 * It never runs the importer. Ingestion belongs to the scheduled refresh, and a
 * request path that could start it would be a second way into the daily job.
 *
 * Exit codes:
 *   0 = export confirmed queued while this was watching
 *   1 = Google session cookies missing/expired — re-run `pnpm takeout:login`
 *   2 = blocked, failed, unreadable state, or the window never opened
 *   3 = nothing to approve: already queued, or another holder owns the window
 *   4 = still waiting for a person, with the window confirmed open
 */
import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { hasGoogleSessionCookies } from "./browser";
import { parseCliArgs, positiveNumber } from "./cli-args";
import { LOCAL_TSX_CLI, takeoutPaths } from "./config";
import { exitWhenDone } from "./entry";
import { planAttempt, readRequestState } from "./request-state";
import { readSession, requestResume } from "./session";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_POLL_SEC = 10;
/** Polls to allow the detached holder to register itself before giving up. */
const HOST_START_POLLS = 3;

const USAGE = `Usage: tsx scripts/takeout/approve.ts [options]
Asks for the headed approval window and watches for a result. The window belongs
to a detached session host, so this process timing out does not close it.

  --wait <min>      How long to watch (default 20). Does not bound the window.
  --deadline <min>  How long the window keeps polling (default 360).
  --poll <sec>      Seconds between checks (default 10).
  --no-launch       Watch an existing window; never start one.
  --retry-unconfirmed <attempt-id>
                    Give up on that attempt's "Create export" click, which
                    Google never turned into an export, and start a new one.
  --help            Show this and exit.

The window's log: request-session.log in the state directory.
This never runs the importer.`;

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

/** Best-effort native notification so the request for a tap is noticeable. */
function notifyMac(title: string, message: string) {
  try {
    spawnSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Glass"`,
    ]);
  } catch {
    /* non-fatal */
  }
}

/** Where the window's owner writes its event log. */
export function sessionLogPath(): string {
  return path.join(takeoutPaths().stateDir, "request-session.log");
}

/**
 * Start the window's owner, detached, so it outlives this process. Its output
 * goes to a file: a holder that stalls with nowhere to write leaves nothing to
 * diagnose it by (2026-10-05).
 */
function launchHost(deadlineMin: number, retryId: string | null): void {
  fs.mkdirSync(takeoutPaths().stateDir, { recursive: true });
  const log = fs.openSync(sessionLogPath(), "a");
  try {
    const child = spawn(
      process.execPath,
      [
        LOCAL_TSX_CLI,
        "scripts/takeout/session-host.ts",
        "--deadline",
        String(deadlineMin),
        ...(retryId === null ? [] : ["--retry-unconfirmed", retryId]),
      ],
      { cwd: REPO_ROOT, detached: true, stdio: ["ignore", log, log] },
    );
    child.unref();
  } finally {
    fs.closeSync(log);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns the exit code. */
export async function main(): Promise<number> {
  // Arguments first: before any cookie is read or any process spawned.
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2), {
      flags: ["--no-launch"],
      values: ["--wait", "--deadline", "--poll", "--retry-unconfirmed"],
      retired: ["--then-ingest", "--timeout", "--no-headed", "--dry-run"],
      usage: USAGE,
    });
  } catch (error) {
    emit("approve_invalid_arguments", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    console.error(USAGE);
    return 2;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  const waitMin = positiveNumber(parsed.values.get("--wait"), 20);
  const deadlineMin = positiveNumber(parsed.values.get("--deadline"), 360);
  const noLaunch = parsed.flags.has("--no-launch");
  const pollMs = positiveNumber(parsed.values.get("--poll"), DEFAULT_POLL_SEC) * 1000;
  const retryId = parsed.values.get("--retry-unconfirmed") ?? null;

  if (!hasGoogleSessionCookies()) {
    emit("approve_session_missing");
    return 1;
  }

  // What the record said before this process asked for anything.
  const before = readRequestState();
  if (before.present && !before.state) {
    emit("approve_state_unreadable");
    return 2;
  }
  // A confirmed export suppresses the next request for one cycle. Past that,
  // only Google's list can say whether it is still building, and reading it
  // needs the window.
  const alreadyQueued = () => {
    emit("approve_already_queued", {
      queued_at: before.state?.queued_at ?? null,
      attempt_id: before.state?.attempt?.attempt_id ?? null,
      evidence: before.state?.queue_evidence ?? null,
    });
    return 3;
  };
  if (before.state && planAttempt(before.state, new Date()).action === "already_queued") {
    return alreadyQueued();
  }
  const priorAttemptId = before.state?.attempt?.attempt_id ?? null;
  if (retryId !== null) {
    // Checked here as well as in the window's owner, so a wrong id opens
    // nothing. The queue check that can still refuse it needs the window.
    const reason =
      priorAttemptId !== retryId
        ? "no_such_attempt"
        : !before.state?.attempt?.submitted_at
          ? "not_submitted"
          : null;
    if (reason) {
      emit("approve_retry_refused", { reason });
      return 2;
    }
  }

  const session = readSession();
  if (session.kind === "alive" && retryId !== null) {
    // Giving up on an attempt is a decision for a fresh window; a live one may
    // be the very place that attempt is still being finished.
    emit("approve_retry_refused", { reason: "window_open" });
    return 3;
  } else if (session.kind === "alive") {
    // A window that stopped polling — because its deadline passed, or because
    // something needed a person — is waiting, not finished. Attaching is also
    // how someone who signed in by hand says "carry on": the holder consumes
    // the request and resumes in the same window, launching nothing.
    requestResume();
    emit("approve_watching_existing_window", { resume_requested: true });
  } else if (session.kind === "foreign") {
    emit("approve_foreign_session");
    return 3;
  } else if (session.kind === "unreadable") {
    // An unverifiable record counts as a window that exists.
    emit("approve_session_unreadable");
    return 3;
  } else if (noLaunch) {
    emit("approve_no_session");
    return 3;
  } else {
    launchHost(deadlineMin, retryId);
    emit("approve_window_requested", {
      deadline_min: deadlineMin,
      retry_unconfirmed: retryId,
      log: sessionLogPath(),
    });
    notifyMac(
      "Approve YouTube export",
      "Complete the sign-in in the browser window to queue this week's export.",
    );
    // The holder claims ownership before it launches the browser, so a record
    // that never appears means no window was opened. Unless the window has
    // already done its work and gone: an export Google finished earlier is
    // verified in seconds, between two of these checks (live, 2026-10-08).
    const recordMoved = () =>
      readRequestState().state?.updated_at !== before.state?.updated_at;
    let started = false;
    for (let poll = 0; poll < HOST_START_POLLS; poll += 1) {
      await sleep(pollMs);
      if (readSession().kind === "alive" || recordMoved()) {
        started = true;
        break;
      }
    }
    if (!started) {
      emit("approve_window_not_started");
      return 2;
    }
  }

  const deadline = Date.now() + waitMin * 60_000;
  let lastPhase: string | null = null;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const read = readRequestState();
    if (read.present && !read.state) {
      emit("approve_state_unreadable");
      return 2;
    }
    const state = read.state;
    if (!state) continue;
    // The record as it stood before this run is the past, whatever it says.
    // A blocker or a failure there is what the window was opened to resolve,
    // and a queued record is last cycle's. Only what the window writes now
    // is this run's result; a window that ends without writing anything new
    // found nothing to change (its log says why).
    if (state.updated_at === before.state?.updated_at) {
      if (readSession().kind === "alive") continue;
      if (before.state.phase === "queued") return alreadyQueued();
      break;
    }
    // Until the new window has given the old attempt up, the record still
    // describes it. That is the past too.
    if (retryId !== null && state.attempt?.attempt_id === retryId) {
      if (readSession().kind !== "alive") break;
      continue;
    }
    if (state.phase !== lastPhase) {
      emit("approve_phase", {
        phase: state.phase,
        blocker: state.blocker,
        auth_step: state.auth_step,
      });
      lastPhase = state.phase;
    }
    if (state.phase === "queued") {
      // Acceptance belongs to an attempt that queued while this was watching.
      const attemptId = state.attempt?.attempt_id ?? null;
      emit("approve_queued", {
        queued_at: state.queued_at,
        attempt_id: attemptId,
        fresh: true,
        evidence: state.queue_evidence,
      });
      notifyMac("YouTube export queued", "Google is building the archive.");
      return 0;
    }
    if (state.phase === "failed") {
      emit("approve_failed", { last_error: state.last_error });
      return 2;
    }
    if (state.blocker && state.blocker !== "passkey_tap_required") {
      // Something only a person can change, outside the browser flow.
      emit("approve_blocked", { blocker: state.blocker });
      return 2;
    }
  }

  // Only claim the window is open if the holder's record says it is.
  const stillOwned = readSession();
  if (stillOwned.kind !== "alive") {
    emit("approve_window_gone", { session: stillOwned.kind });
    return 2;
  }
  emit("approve_still_waiting", {
    waited_min: waitMin,
    window_open_until_min: deadlineMin,
  });
  return 4;
}

/**
 * Run only when this file is the process entry. Importing it — from a test, or
 * from another script — must not start a browser or claim a session.
 */
export const done =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
    ? exitWhenDone(main, (error) => {
        emit("approve_crashed", {
          reason: error instanceof Error ? error.name : "unknown",
        });
      })
    : Promise.resolve();
