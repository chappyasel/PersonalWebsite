/**
 * Request a YouTube-only Google Takeout export (watch-history as JSON),
 * delivered to Drive so download.ts can grab it via the Drive API.
 *
 * This is the headless path. It owns no decisions: the recorded request state
 * decides what this run may do (`request-flow.ts`), and the result is written to
 * `request-state.json`. It never touches the importer's `state.json`, never
 * clicks "Create export" twice for one attempt, and never calls an export
 * queued without a /manage card that says so.
 *
 * A "verify it's you" step parks the attempt at `awaiting_auth`. Nothing here
 * signs in: `approve.ts` opens a window, the person does Google's step, and
 * the same window confirms the export.
 *
 * Run with: npx tsx scripts/takeout/request.ts
 *   --dry-run  Report what the recorded state would allow, then stop.
 *   --help     Show usage and exit.
 *
 * Exit codes:
 *   0 = export confirmed queued, verified on /manage
 *   1 = Google session cookies missing/expired — re-run `pnpm takeout:login`
 *   2 = UI failure, or blocked pending an operator (see request-state.json)
 *   3 = nothing to do: already queued, an export is already building, or
 *       another host owns the attempt
 *   4 = awaiting_auth — a human step is required; `approve.ts` opens the window
 *   5 = another request holds the mutex, or the queue could not be read
 */
import type { Page } from "playwright";
import { pathToFileURL } from "url";

import { close, getPage, hasGoogleSessionCookies } from "./browser";
import { parseCliArgs } from "./cli-args";
import { exitWhenDone } from "./entry";
import { acquireNamedLock } from "./lock";
import { pageFlowDeps } from "./page-wiring";
import { type FlowOutcome, runRequestAttempt } from "./request-flow";
import {
  blankRequestState,
  readRequestState,
  recordFailure,
  writeRequestState,
} from "./request-state";
import { readSession } from "./session";

const USAGE = `Usage: tsx scripts/takeout/request.ts [--dry-run]
Headless Takeout export request. The recorded request state decides what this
run may do; it never writes the importer's state and never runs the importer.

  --dry-run  Report what the recorded state would allow, then stop.
  --help     Show this and exit.`;

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

const EXIT: Record<FlowOutcome["kind"], number> = {
  queued: 0,
  awaiting_auth: 4,
  submission_unverified: 5,
  already_queued: 3,
  pending_export_exists: 3,
  queue_unobserved: 5,
  blocked: 2,
  deferred: 3,
  failed: 2,
};

/** Returns the exit code; `exitWhenDone` flushes stdout before exiting with it. */
export async function main(): Promise<number> {
  // Arguments first: before any cookie is read, any state written, or any
  // browser launched. A retired flag must not quietly change behaviour.
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2), {
      flags: ["--dry-run"],
      values: [],
      retired: ["--debug", "--timeout", "--no-headed"],
      usage: USAGE,
    });
  } catch (error) {
    emit("request_invalid_arguments", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    console.error(USAGE);
    return 2;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }

  if (parsed.flags.has("--dry-run")) {
    const read = readRequestState();
    emit("request_dry_run", {
      present: read.present,
      phase: read.state?.phase ?? null,
      blocker: read.state?.blocker ?? null,
      unreadable: read.present && !read.state,
    });
    return 0;
  }

  // The mutex comes before every read that a decision rests on and every write,
  // so two runs cannot interleave a cookie check with a state update.
  let release: (() => void) | undefined;
  try {
    release = acquireNamedLock("request.lock");
  } catch {
    emit("request_lock_busy");
    return 5;
  }

  try {
    const read = readRequestState();
    if (read.present && !read.state) {
      // Replacing a record we cannot parse would discard the only evidence
      // that an export might already have been submitted.
      emit("request_state_unreadable");
      return 2;
    }

    // A headed approval window already owns this flow; a second, headless
    // driver would fight it for the same form. Anything unverifiable about the
    // session counts as a window that exists.
    const session = readSession();
    if (session.kind === "alive") {
      emit("request_session_busy");
      return 3;
    }
    if (session.kind === "unreadable") {
      emit("request_session_unreadable");
      return 3;
    }

    if (!hasGoogleSessionCookies()) {
      // Absent is fine to start from; unreadable was refused above, so the
      // only thing that can be overwritten here is a record we understood.
      writeRequestState(
        recordFailure(read.state ?? blankRequestState(), {
          now: new Date(),
          error: "session_cookies_missing",
        }),
      );
      emit("request_session_missing");
      return 1;
    }

    // The browser opens only if the plan needs a page.
    let page: Page | null = null;
    const openPage = async (): Promise<Page> => {
      page ??= await getPage({ headless: true });
      return page;
    };

    const outcome = await runRequestAttempt(
      pageFlowDeps({ openPage, sessionView: () => session }),
    );
    emit("request_outcome", outcome);
    return EXIT[outcome.kind];
  } catch (error) {
    // Page content and child output can carry session detail; only the code
    // goes to the log. The recorded state keeps whatever the attempt
    // established, including an unresolved submission.
    emit("request_crashed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return 2;
  } finally {
    release();
    await close().catch(() => undefined);
  }
}

/**
 * Run only when this file is the process entry. Importing it — from a test, or
 * from another script — must not start a browser or claim a session.
 */
export const done =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
    ? exitWhenDone(main)
    : Promise.resolve();
