/**
 * Shared Google Takeout UI steps, used by both the headless auto path
 * (request.ts) and the headed human-approval path (approve.ts). Keeping the
 * form-filling logic in one place means a Google UI change only needs fixing
 * once.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { type Page } from "playwright";

export const TAKEOUT_URL = "https://takeout.google.com/";

/** URLs/text that indicate Google bounced us to a sign-in or reauth/passkey gate. */
export const AUTH_GATE_RE =
  /accounts\.google\.com|\/signin|\/challenge|ServiceLogin|rejected|verify it.?s you/i;

const DEBUG_DIR = path.join(os.homedir(), ".local/share/youtube-takeout/debug");

export async function snap(page: Page, label: string, enabled: boolean) {
  if (!enabled) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const fname = `${Date.now()}-${label}.png`;
  await page.screenshot({ path: path.join(DEBUG_DIR, fname), fullPage: true });
  console.log(`[debug] snap: ${fname}`);
}

/**
 * Steps 1–5a: open Takeout, deselect everything, select YouTube-only, switch
 * watch-history to JSON, advance to delivery, and set delivery to "Add to
 * Drive" (so download.ts can grab the zip via the Drive API with no passkey
 * wall). Leaves the page on the delivery screen, ready for "Create export".
 */
export async function fillExportForm(page: Page, debug = false) {
  console.log(`[flow] Navigating to ${TAKEOUT_URL}`);
  await page.goto(TAKEOUT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await snap(page, "01-landing", debug);

  // Step 1: Deselect all products.
  console.log("[flow] Step 1: Deselect all");
  const deselectAll = page.getByRole("button", { name: /^Deselect all$/i }).first();
  await deselectAll.waitFor({ timeout: 20_000 });
  await deselectAll.click();
  await page.waitForTimeout(800);
  await snap(page, "02-deselected", debug);

  // Step 2: Check the YouTube and YouTube Music row.
  console.log("[flow] Step 2: Check YouTube and YouTube Music");
  const ytCheckbox = page.getByRole("checkbox", { name: /YouTube and YouTube Music/i });
  await ytCheckbox.waitFor({ timeout: 10_000 });
  await ytCheckbox.scrollIntoViewIfNeeded();
  await ytCheckbox.check();
  await page.waitForTimeout(3000);
  await snap(page, "03-youtube-checked", debug);

  // Step 4: Switch watch-history file format from HTML → JSON.
  console.log("[flow] Step 4: Switch format to JSON");
  const formatsBtn = page
    .getByRole("button", { name: /Multiple formats for YouTube and YouTube Music/i })
    .first();
  await formatsBtn.waitFor({ timeout: 10_000 });
  await formatsBtn.click();
  await page.waitForTimeout(1000);
  await snap(page, "07-formats-dialog", debug);

  const historyCombo = page.getByRole("combobox", { name: "history" });
  await historyCombo.waitFor({ timeout: 5000 });
  const currentValue = await historyCombo.innerText().catch(() => "");
  console.log(`[flow] history format currently: ${currentValue}`);
  if (!/json/i.test(currentValue)) {
    await historyCombo.click();
    await page.waitForTimeout(500);
    const jsonOption = page.getByRole("option", { name: /^JSON$/i }).first();
    await jsonOption.waitFor({ timeout: 5000 });
    await jsonOption.click();
    await page.waitForTimeout(500);
    console.log("[flow] Switched to JSON.");
  } else {
    console.log("[flow] Already JSON — no change.");
  }
  await snap(page, "07b-after-json-select", debug);

  const formatsOk = page.getByRole("button", { name: /^OK$/i }).last();
  await formatsOk.click();
  await page.waitForTimeout(1000);
  await snap(page, "08-after-format-ok", debug);

  // Step 5: Next step → delivery options
  console.log("[flow] Step 5: Next step");
  const nextStep = page.getByRole("button", { name: /Next step/i }).first();
  await nextStep.click();
  await page.waitForTimeout(2000);
  await snap(page, "09-delivery", debug);

  // Step 5a: Switch delivery from email link → "Add to Drive".
  console.log("[flow] Step 5a: Switch delivery to Add to Drive");
  const transferCombo = page
    .getByRole("combobox")
    .filter({ hasText: /Send download link|Add to Drive|Add to Dropbox|Add to OneDrive/i })
    .first();
  await transferCombo.waitFor({ timeout: 10_000 });
  const transferValue = await transferCombo.innerText().catch(() => "");
  console.log(`[flow] Transfer currently: ${transferValue}`);
  if (!/Add to Drive/i.test(transferValue)) {
    await transferCombo.click();
    await page.waitForTimeout(500);
    const driveOption = page.getByRole("option", { name: /Add to Drive/i }).first();
    await driveOption.waitFor({ timeout: 5000 });
    await driveOption.click();
    await page.waitForTimeout(500);
    console.log("[flow] Switched delivery to Add to Drive.");
  } else {
    console.log("[flow] Already Add to Drive — no change.");
  }
  await snap(page, "09b-drive-delivery", debug);
}

/** Click "Create export". Does not wait for or verify the result. */
export async function clickCreateExport(page: Page) {
  console.log("[flow] Create export");
  const createBtn = page.getByRole("button", { name: /Create export/i }).first();
  await createBtn.click();
}

export type VerifyResult = "ok" | "auth" | "notfound";

/**
 * Confirm the "Create export" click actually queued an export. Google's reauth
 * gate can silently block submission in headless contexts, so a click alone is
 * not proof. The /manage summary page shows an "Export in progress" card while
 * Google builds the archive — that card is the only reliable signal.
 */
export async function verifyExportQueued(page: Page): Promise<VerifyResult> {
  if (AUTH_GATE_RE.test(page.url())) return "auth";

  try {
    await page.goto("https://takeout.google.com/manage", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2500);
  } catch {
    /* fall through to content checks */
  }

  if (AUTH_GATE_RE.test(page.url())) return "auth";
  const pwVisible = await page
    .locator("input[type=password]")
    .first()
    .isVisible()
    .catch(() => false);
  if (pwVisible) return "auth";

  const inProgress = page
    .getByText(/Export in progress|creating a copy of data/i)
    .first();
  try {
    await inProgress.waitFor({ state: "visible", timeout: 8000 });
    return "ok";
  } catch {
    return "notfound";
  }
}
