/**
 * Top-level state machine for the YouTube Takeout auto-refresh.
 * Idempotent — safe to run on a cron tick. Exits 0 always; the agent reads
 * stdout (one JSON event per line) to decide whether to post a summary.
 *
 * Behaviour by current state:
 *   idle      — if last_ingested_at is older than MIN_AGE_DAYS AND today is a
 *               request day, try the HEADLESS request (request.ts):
 *                 • exit 0  → mark `requested` (fully automatic, no human).
 *                 • exit 4  → Google demanded a passkey step-up. Launch the
 *                             headed approval window (approve.ts) for a one-tap
 *                             human approval and emit `request_needs_passkey`.
 *                 • exit 1  → session expired → emit `requested_auth_failure`.
 *   requested — try download.ts (Drive API). On success run sync + classify +
 *               score top-up → mark idle. "Not ready" → wait. Stuck >
 *               GIVE_UP_DAYS → give up.
 *
 * A staleness watchdog runs on every tick regardless of state: if the data is
 * older than STALE_ALERT_DAYS it emits `data_stale` (throttled to once/24h) so
 * silent drift can't go unnoticed.
 *
 * Run with: npx tsx scripts/takeout/refresh.ts
 */

import { execSync, spawnSync, spawn } from "child_process";
import * as path from "path";
import { readState, writeState } from "./state";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const MIN_AGE_DAYS = 5;        // request a new export at most ~weekly
const GIVE_UP_DAYS = 5;        // abandon a stuck request after this long
const REQUEST_DAYS = new Set([0, 6]); // 0=Sun, 6=Sat — request on the weekend (Saturday anchor)
const STALE_ALERT_DAYS = 9;    // loud watchdog alert if the data is older than this
const APPROVAL_PENDING_MIN = 25; // don't relaunch a headed approval within this window

function daysAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function minutesAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function runScript(rel: string, args: string[] = []): { code: number; out: string } {
  const res = spawnSync("npx", ["tsx", rel, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  return { code: res.status ?? 1, out };
}

/** Open the headed one-tap approval window, detached so it outlives this tick. */
function launchApprovalDetached() {
  const child = spawn("npx", ["tsx", "scripts/takeout/approve.ts", "--timeout", "20"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

async function main() {
  const state = readState();
  emit("state_loaded", { state });

  // ── Staleness watchdog (independent of the state machine) ──
  const ingestAge = daysAgo(state.last_ingested_at);
  if (ingestAge > STALE_ALERT_DAYS && daysAgo(state.last_stale_alert_at) > 1) {
    state.last_stale_alert_at = new Date().toISOString();
    writeState(state);
    emit("data_stale", { age_days: Math.round(ingestAge) });
  }

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
    const { code, out } = runScript("scripts/takeout/request.ts");

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
      emit("requested_auth_failure", { tail: out.slice(-500) });
    } else {
      writeState({
        ...state,
        last_error: `request_failed_${code}`,
        consecutive_failures: state.consecutive_failures + 1,
      });
      emit("requested_failed", { code, tail: out.slice(-500) });
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
    return;
  }

  emit("checking_download", { request_age_days: Math.round(reqAge) });
  const dl = runScript("scripts/takeout/download.ts", [
    "--requested-at",
    state.requested_at!,
  ]);

  if (dl.code === 3) {
    emit("not_ready_yet");
    return;
  }
  if (dl.code === 1) {
    writeState({
      ...state,
      last_error: "google_auth_expired",
      consecutive_failures: state.consecutive_failures + 1,
    });
    emit("download_auth_failure", { tail: dl.out.slice(-500) });
    return;
  }
  if (dl.code !== 0) {
    writeState({
      ...state,
      last_error: `download_failed_${dl.code}`,
      consecutive_failures: state.consecutive_failures + 1,
    });
    emit("download_failed", { code: dl.code, tail: dl.out.slice(-500) });
    return;
  }

  emit("download_ok", { tail: dl.out.slice(-300) });

  emit("running_sync");
  try {
    const syncOut = execSync("npx tsx scripts/sync-youtube.ts", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    emit("sync_ok", { tail: syncOut.slice(-500) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeState({
      ...state,
      last_error: `sync_failed`,
      consecutive_failures: state.consecutive_failures + 1,
    });
    emit("sync_failed", { error: msg.slice(-500) });
    return;
  }

  emit("running_classify");
  try {
    const classifyOut = execSync("npx tsx scripts/classify-youtube.ts", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    emit("classify_ok", { tail: classifyOut.slice(-500) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Classify failure is non-fatal — ingest already happened.
    emit("classify_failed", { error: msg.slice(-500) });
  }

  // Learning Value and Positivity read yt_classifications, which the step above
  // does not write; without this the dashboard's score coverage decays a little
  // more with every ingest. --top-up appends the few hundred videos this export
  // brought to the live run rather than rescoring the whole library, so a week's
  // catch-up costs cents and a couple of minutes.
  emit("running_score");
  try {
    const scoreOut = execSync(
      "npx tsx scripts/score-youtube.ts --scope all --top-up --execute --activate",
      { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" },
    );
    emit("score_ok", { tail: scoreOut.slice(-500) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Also non-fatal: stale scores are better than a failed refresh, and the
    // next tick tops up whatever this one missed.
    emit("score_failed", { error: msg.slice(-500) });
  }

  writeState({
    state: "idle",
    requested_at: null,
    last_ingested_at: new Date().toISOString(),
    last_error: null,
    consecutive_failures: 0,
    approval_pending_since: null,
    last_stale_alert_at: null,
  });
  emit("refresh_complete");
}

main().catch((err) => {
  emit("orchestrator_crashed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(0);
});
