/**
 * Request a YouTube-only Google Takeout export with watch-history as JSON.
 * Delivery: "Send download link via email" (we'll grab it from /manage later).
 *
 * Run with: npx tsx scripts/takeout/request.ts
 *   --debug    Take screenshots at each step to ~/.local/share/youtube-takeout/debug/.
 *
 * Exits 0 on submitted, 1 on auth failure, 2 on UI failure.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { type Page } from "playwright";
import { getPage, close, hasGoogleSessionCookies } from "./browser";

const TAKEOUT_URL = "https://takeout.google.com/";
const DEBUG = process.argv.includes("--debug");
const DRY_RUN = process.argv.includes("--dry-run");
const DEBUG_DIR = path.join(os.homedir(), ".local/share/youtube-takeout/debug");

async function snap(page: Page, label: string) {
  if (!DEBUG) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const fname = `${Date.now()}-${label}.png`;
  await page.screenshot({ path: path.join(DEBUG_DIR, fname), fullPage: true });
  console.log(`[debug] snap: ${fname}`);
}

async function main() {
  if (!hasGoogleSessionCookies()) {
    console.error("Google session cookies missing — run `yarn takeout:login` to sign in.");
    process.exit(1);
  }
  const page = await getPage({ headless: !DEBUG });

  console.log(`[request] Navigating to ${TAKEOUT_URL}`);
  await page.goto(TAKEOUT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await snap(page, "01-landing");

  // Step 1: Deselect all products (top-level "Deselect all" button).
  console.log("[request] Step 1: Deselect all");
  const deselectAll = page.getByRole("button", { name: /^Deselect all$/i }).first();
  await deselectAll.waitFor({ timeout: 20_000 });
  await deselectAll.click();
  await page.waitForTimeout(800);
  await snap(page, "02-deselected");

  // Step 2: Check the YouTube and YouTube Music row.
  console.log("[request] Step 2: Check YouTube and YouTube Music");
  const ytCheckbox = page.getByRole("checkbox", { name: /YouTube and YouTube Music/i });
  await ytCheckbox.waitFor({ timeout: 10_000 });
  await ytCheckbox.scrollIntoViewIfNeeded();
  await ytCheckbox.check();
  // The subset button materializes via a row-level state change after the
  // checkbox flip. Give the page time to react.
  await page.waitForTimeout(3000);
  await snap(page, "03-youtube-checked");

  // (Skipping subset restriction: the per-product subset button is hidden in
  // the current page layout. Including all YouTube data types means a slightly
  // larger zip but download.ts + sync-youtube.ts only read watch-history.json.)

  // Step 4: Switch watch-history file format from HTML → JSON.
  // The format picker is a Material combobox (role=combobox, aria-label per
  // data type) — NOT an HTML <select>. Click to open, click the JSON option.
  console.log("[request] Step 4: Switch format to JSON");
  const formatsBtn = page
    .getByRole("button", { name: /Multiple formats for YouTube and YouTube Music/i })
    .first();
  await formatsBtn.waitFor({ timeout: 10_000 });
  await formatsBtn.click();
  await page.waitForTimeout(1000);
  await snap(page, "07-formats-dialog");

  const historyCombo = page.getByRole("combobox", { name: "history" });
  await historyCombo.waitFor({ timeout: 5000 });
  const currentValue = await historyCombo.innerText().catch(() => "");
  console.log(`[request] history format currently: ${currentValue}`);
  if (!/json/i.test(currentValue)) {
    await historyCombo.click();
    await page.waitForTimeout(500);
    const jsonOption = page.getByRole("option", { name: /^JSON$/i }).first();
    await jsonOption.waitFor({ timeout: 5000 });
    await jsonOption.click();
    await page.waitForTimeout(500);
    console.log("[request] Switched to JSON.");
  } else {
    console.log("[request] Already JSON — no change.");
  }
  await snap(page, "07b-after-json-select");

  const formatsOk = page.getByRole("button", { name: /^OK$/i }).last();
  await formatsOk.click();
  await page.waitForTimeout(1000);
  await snap(page, "08-after-format-ok");

  // Step 5: Next step → delivery options
  console.log("[request] Step 5: Next step");
  const nextStep = page.getByRole("button", { name: /Next step/i }).first();
  await nextStep.click();
  await page.waitForTimeout(2000);
  await snap(page, "09-delivery");

  // Step 5a: Switch delivery from "Send download link via email" → "Add to Drive".
  // The "Add to Drive" path lets us download via Drive API later (no passkey wall).
  // The combobox doesn't have a clean aria-label; we find it by current text.
  console.log("[request] Step 5a: Switch delivery to Add to Drive");
  const transferCombo = page
    .getByRole("combobox")
    .filter({ hasText: /Send download link|Add to Drive|Add to Dropbox|Add to OneDrive/i })
    .first();
  await transferCombo.waitFor({ timeout: 10_000 });
  const transferValue = await transferCombo.innerText().catch(() => "");
  console.log(`[request] Transfer currently: ${transferValue}`);
  if (!/Add to Drive/i.test(transferValue)) {
    await transferCombo.click();
    await page.waitForTimeout(500);
    const driveOption = page.getByRole("option", { name: /Add to Drive/i }).first();
    await driveOption.waitFor({ timeout: 5000 });
    await driveOption.click();
    await page.waitForTimeout(500);
    console.log("[request] Switched delivery to Add to Drive.");
  } else {
    console.log("[request] Already Add to Drive — no change.");
  }
  await snap(page, "09b-drive-delivery");

  if (DRY_RUN) {
    console.log("[request] DRY RUN — skipping Create export click.");
    await close();
    process.exit(0);
  }

  console.log("[request] Step 6: Create export");
  const createBtn = page.getByRole("button", { name: /Create export/i }).first();
  await createBtn.click();

  await page.waitForURL(/exports|progress/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await snap(page, "10-submitted");
  console.log(`[request] Submitted (URL now: ${page.url()})`);

  await close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Request failed:", err);
  await close().catch(() => {});
  process.exit(2);
});
