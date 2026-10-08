/**
 * Discover Drive archives on every tick, then apply the existing request policy.
 * --no-browser: discover + sync + classify + score, with no export requests/UI.
 * --download-only: stage an archive only; no DB writes, enrichment or browser.
 * Drive/ingestion/enrichment failures exit nonzero. Expired request-browser
 * auth stays observable without pausing the cron that discovers Drive archives.
 */
import { execFileSync, spawn, spawnSync } from "child_process";
import * as path from "path";

import { LOCAL_TSX_CLI } from "./config";
import { acquireRefreshLock } from "./lock";
import { readRequestState } from "./request-state";
import {
  type DriveCheck,
  computeE2eStatus,
  freshnessMaxAgeHours,
} from "./status";
import * as os from "os";

import {
  type RefreshState,
  ingestedArchive,
  readDownloadedArchive,
  readState,
  writeState,
} from "./state";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const MIN_AGE_DAYS = 5; // request a new export at most ~weekly
const GIVE_UP_DAYS = 5; // abandon a stuck request after this long
const REQUEST_DAYS = new Set([0, 6]); // 0=Sun, 6=Sat — request on the weekend (Saturday anchor)
const STALE_ALERT_DAYS = 9; // loud watchdog alert if the data is older than this
const APPROVAL_PENDING_MIN = 25; // don't relaunch a headed approval within this window

function daysAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function minutesAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function runScript(
  rel: string,
  args: string[] = [],
): { code: number; out: string } {
  const res = spawnSync(process.execPath, [LOCAL_TSX_CLI, rel, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  return { code: res.status ?? 1, out };
}

/** Open the headed one-tap approval window, detached so it outlives this tick. */
function launchApprovalDetached() {
  const child = spawn(
    process.execPath,
    [LOCAL_TSX_CLI, "scripts/takeout/approve.ts", "--timeout", "20"],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

/**
 * Report where the pipeline actually stands, alongside the event that says what
 * this tick did. `no_new_archive` only ever meant "the Drive check is healthy";
 * on its own it reads as success even when the newest archive Google built is a
 * week old. This emits coverage, the ingestion time and the request state as
 * separate facts, from files only — no Drive call, no browser, no request.
 */
function emitE2eStatus(state: RefreshState | null, driveCheck: DriveCheck) {
  try {
    emit("e2e_status", {
      status: computeE2eStatus({
        now: new Date(),
        importer: state,
        request: readRequestState(),
        driveCheck,
        hostname: os.hostname(),
        maxAgeHours: freshnessMaxAgeHours(process.env),
      }),
    });
  } catch {
    // A status read must never be able to fail a tick that otherwise worked.
    emit("e2e_status_unavailable");
  }
}

function refresh(downloadOnly: boolean, noBrowser: boolean) {
  const state = readState();
  emit("state_loaded", { state });

  // ── Staleness watchdog (independent of the state machine) ──
  const ingestAge = daysAgo(state.last_ingested_at);
  if (ingestAge > STALE_ALERT_DAYS && daysAgo(state.last_stale_alert_at) > 1) {
    state.last_stale_alert_at = new Date().toISOString();
    writeState(state);
    emit("data_stale", { age_days: Math.round(ingestAge) });
  }

  const watermark = ingestedArchive(state);
  const args: string[] = [];
  if (watermark?.exportCreatedAt)
    args.push("--after-export-created-at", watermark.exportCreatedAt);
  if (watermark?.driveFileId)
    args.push("--exclude-file-id", watermark.driveFileId);
  emit("checking_download");
  const dl = runScript("scripts/takeout/download.ts", args);
  if (dl.code === 3) {
    if (!downloadOnly && state.enrichment_pending) {
      finishEnrichment(state);
      return;
    }
    if (noBrowser || downloadOnly) {
      emit("no_new_archive");
      emitE2eStatus(state, "healthy");
      return;
    }
    requestIfDue(state);
    return;
  }
  if (dl.code === 1) {
    const failed = {
      ...state,
      last_error: "drive_auth_failed",
      consecutive_failures: state.consecutive_failures + 1,
    };
    writeState(failed);
    emit("download_auth_failure");
    emitE2eStatus(failed, "failing");
    process.exitCode = 1;
    return;
  }
  if (dl.code !== 0) {
    const failed = {
      ...state,
      last_error: `download_failed_${dl.code}`,
      consecutive_failures: state.consecutive_failures + 1,
    };
    writeState(failed);
    emit("download_failed", { code: dl.code });
    emitE2eStatus(failed, "failing");
    process.exitCode = 1;
    return;
  }

  const archive = readDownloadedArchive();
  if (!archive) throw new Error("missing_archive_sidecar");
  emit("download_ok", {
    source_file: archive.sourceFile,
    export_created_at: archive.exportCreatedAt,
  });
  if (downloadOnly) {
    emit("download_only_complete");
    return;
  }

  emit("running_sync");
  try {
    const syncOut = execFileSync(
      process.execPath,
      [LOCAL_TSX_CLI, "scripts/sync-youtube.ts"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    const completion = syncOut
      .split(/\r?\n/)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      })
      .find((event) => event?.event === "youtube_sync_complete");
    if (
      completion?.status !== "success" ||
      completion.exportCreatedAt !== archive.exportCreatedAt ||
      completion.sourceFile !== archive.sourceFile
    ) {
      throw new Error("sync_success_not_confirmed");
    }
    emit("sync_ok", { export_created_at: archive.exportCreatedAt });
  } catch {
    const failed = {
      ...state,
      last_error: `sync_failed`,
      consecutive_failures: state.consecutive_failures + 1,
    };
    writeState(failed);
    emit("sync_failed");
    // The Drive check itself worked — it found and staged this archive. Only
    // the ingestion failed, and conflating the two would send an operator to
    // the wrong place.
    emitE2eStatus(failed, "healthy");
    process.exitCode = 1;
    return;
  }

  // Commit ingestion before enrichment. A failed score/classify retry must not
  // cause another sync of the same archive on the next tick.
  const ingested: RefreshState = {
    ...state,
    state: "idle",
    requested_at: null,
    last_ingested_at: new Date().toISOString(),
    last_ingested_archive: archive,
    last_error: null,
    consecutive_failures: 0,
    approval_pending_since: null,
    last_stale_alert_at: null,
    enrichment_pending: true,
  };
  writeState(ingested);
  finishEnrichment(ingested);
}

function finishEnrichment(state: RefreshState) {
  const failures: string[] = [];
  emit("running_classify");
  try {
    const classifyOut = execFileSync(
      process.execPath,
      [LOCAL_TSX_CLI, "scripts/classify-youtube.ts"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    emit("classify_ok", { tail: classifyOut.slice(-500) });
  } catch {
    // Preserve the successful ingest, but fail this tick and retry enrichment.
    failures.push("classify_failed");
    emit("classify_failed");
  }

  // Learning Value and Positivity read yt_classifications, which the step above
  // does not write; without this the dashboard's score coverage decays a little
  // more with every ingest. --top-up appends the few hundred videos this export
  // brought to the live run rather than rescoring the whole library, so a week's
  // catch-up costs cents and a couple of minutes.
  emit("running_score");
  try {
    const scoreOut = execFileSync(
      process.execPath,
      [
        LOCAL_TSX_CLI,
        "scripts/score-youtube.ts",
        "--scope",
        "all",
        "--top-up",
        "--execute",
        "--activate",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" },
    );
    emit("score_ok", { tail: scoreOut.slice(-500) });
  } catch {
    // The next tick retries the top-up without reingesting.
    failures.push("score_failed");
    emit("score_failed");
  }

  writeState({
    ...state,
    enrichment_pending: failures.length > 0,
    last_error: failures.length ? failures.join(",") : null,
    consecutive_failures: failures.length ? state.consecutive_failures + 1 : 0,
  });
  const finished = {
    ...state,
    enrichment_pending: failures.length > 0,
    last_error: failures.length ? failures.join(",") : null,
  } as RefreshState;
  if (failures.length) {
    process.exitCode = 1;
    emit("refresh_incomplete", { failures });
  } else {
    emit("refresh_complete");
  }
  emitE2eStatus(finished, "healthy");
}

function requestIfDue(state: RefreshState) {
  if (state.state === "idle") {
    const ageDays = daysAgo(state.last_ingested_at);
    const today = new Date().getDay();

    if (!(ageDays >= MIN_AGE_DAYS && REQUEST_DAYS.has(today))) {
      emit("idle_no_action", {
        last_ingest_age_days: Math.round(ageDays),
        weekday: today,
        reason: ageDays < MIN_AGE_DAYS ? "too_recent" : "not_request_window",
      });
      return;
    }

    // A headed approval window may already be open from an earlier tick — don't
    // stack a second one.
    if (minutesAgo(state.approval_pending_since) < APPROVAL_PENDING_MIN) {
      emit("approval_in_progress", {
        pending_min: Math.round(minutesAgo(state.approval_pending_since)),
      });
      return;
    }

    // Try the fully-automatic headless request first.
    emit("requesting_export", { last_ingest_age_days: Math.round(ageDays) });
    const { code } = runScript("scripts/takeout/request.ts");

    if (code === 0) {
      writeState({
        ...state,
        state: "requested",
        requested_at: new Date().toISOString(),
        last_error: null,
        consecutive_failures: 0,
        approval_pending_since: null,
      });
      emit("requested_ok");
    } else if (code === 4) {
      // Passkey step-up: headless can't clear it. Open the headed one-tap
      // approval window and flag it so the next tick doesn't open a second.
      launchApprovalDetached();
      writeState({
        ...state,
        last_error: "passkey_step_up",
        approval_pending_since: new Date().toISOString(),
      });
      emit("request_needs_passkey");
    } else if (code === 1) {
      writeState({
        ...state,
        last_error: "google_auth_expired",
        consecutive_failures: state.consecutive_failures + 1,
      });
      // Browser auth is independent of Drive OAuth. A nonzero tick here can
      // auto-pause cron and prevent future archive discovery.
      emit("requested_auth_failure");
    } else {
      writeState({
        ...state,
        last_error: `request_failed_${code}`,
        consecutive_failures: state.consecutive_failures + 1,
      });
      emit("requested_failed", { code });
      process.exitCode = 1;
    }
    return;
  }

  // state === "requested"
  const reqAge = daysAgo(state.requested_at);
  if (reqAge > GIVE_UP_DAYS) {
    writeState({
      ...state,
      state: "idle",
      requested_at: null,
      last_error: "request_stuck_gave_up",
      consecutive_failures: state.consecutive_failures + 1,
    });
    emit("gave_up_on_stuck_request", { age_days: Math.round(reqAge) });
    process.exitCode = 1;
    return;
  }

  emit("not_ready_yet");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: tsx scripts/takeout/refresh.ts [--no-browser | --download-only]\n--no-browser: discover, sync, classify and score; never request an export or open a browser.\n--download-only: stage the archive and sidecar; no DB writes, enrichment or browser.",
    );
    return;
  }
  if (args.some((arg) => !["--no-browser", "--download-only"].includes(arg))) {
    throw new Error("invalid_refresh_arguments");
  }
  const release = acquireRefreshLock();
  try {
    refresh(args.includes("--download-only"), args.includes("--no-browser"));
  } finally {
    release();
  }
}

try {
  main();
} catch (error) {
  // Child output and API error objects can contain credentials. Emit only a
  // controlled status; the CLI exit code is the scheduler's failure signal.
  emit(
    error instanceof Error && error.message === "refresh_lock_busy"
      ? "refresh_lock_busy"
      : "orchestrator_crashed",
  );
  process.exitCode = 1;
}
