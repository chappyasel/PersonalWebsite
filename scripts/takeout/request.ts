/**
 * Request a YouTube-only Google Takeout export (watch-history as JSON),
 * delivered to Drive so download.ts can grab it via the Drive API.
 *
 * This is the HEADLESS auto path used by the cron. Google often demands an
 * interactive passkey/reauth at the "Create export" step that cannot be
 * satisfied headlessly — when that happens we exit 4 so the orchestrator can
 * fall back to the headed human-approval path (approve.ts). For the headed
 * path, run approve.ts directly.
 *
 * Run with: npx tsx scripts/takeout/request.ts
 *   --debug    Run headed + screenshot each step to ~/.local/share/youtube-takeout/debug/.
 *   --dry-run  Stop before clicking "Create export" (smoke-tests the form path).
 *
 * Exit codes:
 *   0 = export confirmed queued
 *   4 = passkey/reauth step-up required — session is valid, needs a human tap
 *   1 = Google session cookies missing/expired — re-run `pnpm takeout:login`
 *   2 = UI failure or unconfirmed submission
 */
import { close, getPage, hasGoogleSessionCookies } from "./browser";
import { clickCreateExport, fillExportForm, verifyExportQueued } from "./flow";

const DEBUG = process.argv.includes("--debug");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!hasGoogleSessionCookies()) {
    console.error(
      "Google session cookies missing — run `pnpm takeout:login` to sign in.",
    );
    process.exit(1);
  }
  const page = await getPage({ headless: !DEBUG });

  await fillExportForm(page, DEBUG);

  if (DRY_RUN) {
    console.log("[request] DRY RUN — skipping Create export click.");
    await close();
    process.exit(0);
  }

  await clickCreateExport(page);
  await page
    .waitForURL(/exports|progress|manage/, { timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(2000);
  console.log(`[request] Clicked Create export (URL now: ${page.url()})`);

  // Verify the export actually queued — the click alone is not proof.
  const verdict = await verifyExportQueued(page);
  await close();

  if (verdict === "ok") {
    console.log("[request] Verified: export is in progress.");
    process.exit(0);
  }
  if (verdict === "auth") {
    // Cookies were present at start, so this is a step-up passkey/reauth gate,
    // not an expired session. Headless can't clear it — signal the orchestrator
    // to fall back to the headed approval path.
    console.error(
      "[request] Passkey/reauth step-up required — headless cannot queue the export. Falling back to headed approval (approve.ts).",
    );
    process.exit(4);
  }
  console.error(
    "[request] Could not confirm export queued (no 'Export in progress' card on /manage). Treating as failure so the state machine doesn't wait on a phantom export.",
  );
  process.exit(2);
}

main().catch(async (err) => {
  console.error("Request failed:", err);
  await close().catch(() => undefined);
  process.exit(2);
});
