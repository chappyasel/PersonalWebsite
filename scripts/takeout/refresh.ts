/**
 * Top-level state machine for the YouTube Takeout auto-refresh.
 * Idempotent — safe to run on a cron tick. Exits 0 always; the agent reads
 * stdout to decide whether to post a summary.
 *
 * Behaviour by current state:
 *   idle      — if last_ingested_at is missing or older than MIN_AGE_DAYS AND
 *               today is in the request window, run request.ts → mark requested.
 *   requested — try download.ts. If it succeeds, run syncYouTube + classify
 *               (shell out to the existing scripts) → mark idle, update
 *               last_ingested_at. If download.ts says "not ready yet", do
 *               nothing. If requested_at is > GIVE_UP_DAYS old, give up.
 *
 * Run with: npx tsx scripts/takeout/refresh.ts
 */

import { execSync, spawnSync } from "child_process";
import * as path from "path";
import { readState, writeState } from "./state";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const MIN_AGE_DAYS = 6;        // request a new export at most once per ~week
const GIVE_UP_DAYS = 5;        // abandon a stuck request after this long
const REQUEST_DAYS = new Set([0, 6]); // 0=Sun, 6=Sat — only request on weekends

function daysAgo(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
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

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

async function main() {
  const state = readState();
  emit("state_loaded", { state });

  if (state.state === "idle") {
    const ageDays = daysAgo(state.last_ingested_at);
    const today = new Date().getDay();
    if (ageDays >= MIN_AGE_DAYS && REQUEST_DAYS.has(today)) {
      emit("requesting_export", { last_ingest_age_days: Math.round(ageDays) });
      const { code, out } = runScript("scripts/takeout/request.ts");
      if (code === 0) {
        writeState({
          ...state,
          state: "requested",
          requested_at: new Date().toISOString(),
          last_error: null,
          consecutive_failures: 0,
        });
        emit("requested_ok");
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
    } else {
      emit("idle_no_action", {
        last_ingest_age_days: Math.round(ageDays),
        weekday: today,
        reason: ageDays < MIN_AGE_DAYS ? "too_recent" : "not_request_window",
      });
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

  writeState({
    state: "idle",
    requested_at: null,
    last_ingested_at: new Date().toISOString(),
    last_error: null,
    consecutive_failures: 0,
  });
  emit("refresh_complete");
}

main().catch((err) => {
  emit("orchestrator_crashed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(0);
});
