/**
 * Headed human-approval path for the YouTube Takeout export.
 *
 * Google demands an interactive passkey/reauth at "Create export" that the
 * headless cron (request.ts) cannot satisfy. This script opens a real Chromium
 * window, fills the same form, clicks Create export, then WAITS (default 20
 * min) for you to complete the passkey on your Mac. The moment the export is
 * confirmed queued, it flips the state machine to `requested` so the normal
 * download → sync → classify pipeline takes over (no further human action).
 *
 * If Google happens NOT to challenge (fresh session), it completes with no tap
 * — i.e. this is also a safe superset of the auto path.
 *
 * Run with: npx tsx scripts/takeout/approve.ts
 *   --timeout <min>  How long to wait for the passkey tap (default 20).
 *   --dry-run        Fill the form but stop before Create export.
 *   --no-headed      Run headless (testing only; will fail at the passkey gate).
 *
 * Exit codes:
 *   0 = export confirmed queued, state flipped to `requested`
 *   1 = Google session cookies missing/expired — re-run `pnpm takeout:login`
 *   2 = timed out waiting for the tap, or UI failure
 */
import { spawn, spawnSync } from "child_process";
import * as path from "path";

import { close, getPage, hasGoogleSessionCookies } from "./browser";
import { getDrive } from "./drive";
import {
  AUTH_GATE_RE,
  clickCreateExport,
  fillExportForm,
  verifyExportQueued,
} from "./flow";
import { readState, writeState } from "./state";

const DRY_RUN = process.argv.includes("--dry-run");
const HEADED = !process.argv.includes("--no-headed");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const TIMEOUT_MIN = Number(argValue("--timeout") ?? 20);
const TIMEOUT_MS = Math.max(1, TIMEOUT_MIN) * 60_000;
const RUN_START_MS = Date.now();
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/** Kick the orchestrator (detached) to download+sync+classify right away, so a
 *  tap ingests within minutes instead of waiting for the next cron tick. If the
 *  zip isn't in Drive yet it harmlessly no-ops and the cron picks it up later. */
function ingestNow() {
  const child = spawn("npx", ["tsx", "scripts/takeout/refresh.ts"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/** Best-effort native macOS notification so the tap request is noticeable. */
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

/** Definitive success signal: a fresh Takeout zip in Drive, created at/after
 *  this run started (minus a small margin). The export form selects only
 *  YouTube, but Google's archive number is not stable: June 2026 produced
 *  "-3-" zips and July 2026 produced "-2-" zips. */
async function freshYouTubeZipInDrive(sinceMs: number): Promise<boolean> {
  try {
    const drive = getDrive();
    const resp = await drive.files.list({
      q: "name contains 'takeout-' and trashed = false",
      orderBy: "createdTime desc",
      pageSize: 10,
      fields: "files(name, createdTime)",
    });
    const cutoff = new Date(sinceMs - 5 * 60_000);
    return (resp.data.files ?? []).some(
      (f) =>
        /takeout-\d{8}T\d{6}Z(?:-\d+)?-\d+\.zip$/i.test(f.name ?? "") &&
        !!f.createdTime &&
        new Date(f.createdTime) >= cutoff,
    );
  } catch {
    return false;
  }
}

async function main() {
  if (!hasGoogleSessionCookies()) {
    console.error(
      "Google session cookies missing — run `pnpm takeout:login` to sign in.",
    );
    process.exit(1);
  }

  const page = await getPage({ headless: !HEADED });
  await fillExportForm(page, true);

  if (DRY_RUN) {
    console.log("[approve] DRY RUN — skipping Create export click.");
    await close();
    process.exit(0);
  }

  await clickCreateExport(page);
  console.log(
    "[approve] WAITING_FOR_PASSKEY — complete the passkey in the browser window.",
  );
  notifyMac(
    "Approve YouTube export",
    "Tap your passkey in the open browser window to queue this week's export.",
  );

  // After "Create export", Google usually bounces to a passkey challenge on
  // accounts.google.com. Confirm success two ways, whichever lands first:
  //   1. A fresh YouTube ("-3-") Takeout zip appears in Drive — definitive.
  //   2. Once off the challenge page, /manage shows "Export in progress". We
  //      only probe /manage after leaving the auth gate, so we never navigate
  //      away while the user is mid-tap.
  // If Google didn't challenge at all, #2 confirms on the first pass.
  const deadline = Date.now() + TIMEOUT_MS;
  let queued = false;
  let leftGate = false;
  while (Date.now() < deadline) {
    if (await freshYouTubeZipInDrive(RUN_START_MS)) {
      queued = true;
      break;
    }
    if (!AUTH_GATE_RE.test(page.url())) {
      leftGate = true;
      if ((await verifyExportQueued(page)) === "ok") {
        queued = true;
        break;
      }
    }
    await page.waitForTimeout(15_000);
  }
  await close();

  if (queued) {
    const prev = readState();
    writeState({
      ...prev,
      state: "requested",
      requested_at: new Date().toISOString(),
      last_error: null,
      consecutive_failures: 0,
      approval_pending_since: null,
    });
    console.log(
      "[approve] EXPORT_QUEUED — state flipped to `requested`. Kicking ingest now.",
    );
    notifyMac(
      "YouTube export queued",
      "Approved — ingesting your watch history now.",
    );
    ingestNow();
    process.exit(0);
  }

  console.error(
    `[approve] Timed out after ${TIMEOUT_MIN} min — export not confirmed. ` +
      (leftGate
        ? "Returned from the passkey gate but no export was detected."
        : "The passkey was never completed."),
  );
  process.exit(2);
}

main().catch(async (err) => {
  console.error("Approve failed:", err);
  await close().catch(() => undefined);
  process.exit(2);
});
