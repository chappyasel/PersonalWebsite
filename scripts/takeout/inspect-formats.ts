/**
 * Diagnostic: open takeout.google.com, check YouTube, open subset dialog,
 * then open the formats dialog, and dump everything visible so we can find
 * the right selectors for the file-format step.
 *
 * Also cancels any in-flight export first (clean state).
 *
 * Run with: npx tsx scripts/takeout/inspect-formats.ts
 */

import { getPage, close, hasGoogleSessionCookies } from "./browser";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEBUG_DIR = path.join(os.homedir(), ".local/share/youtube-takeout/debug");

async function main() {
  if (!hasGoogleSessionCookies()) {
    console.error("Not logged in.");
    process.exit(1);
  }
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const page = await getPage({ headless: true });

  // First: cancel any in-flight export from /manage.
  console.log("[inspect] Going to /manage to cancel any in-flight exports");
  await page.goto("https://takeout.google.com/manage", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);

  const cancelBtn = page.getByRole("button", { name: /Cancel export/i }).first();
  if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(800);
    // Confirm dialog
    const confirmBtn = page
      .getByRole("button", { name: /^Cancel export$|^OK$|^Confirm$/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
    console.log("[inspect] Cancelled in-flight export.");
  } else {
    console.log("[inspect] No in-flight export to cancel.");
  }

  // Now back to / and walk to formats dialog
  console.log("[inspect] Navigating to /");
  await page.goto("https://takeout.google.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  console.log("[inspect] Deselecting all");
  await page.getByRole("button", { name: /^Deselect all$/i }).first().click();
  await page.waitForTimeout(800);

  console.log("[inspect] Checking YouTube");
  await page.getByRole("checkbox", { name: /YouTube and YouTube Music/i }).check();
  await page.waitForTimeout(1500);

  // Find all buttons visible near YouTube row. Useful for both subset + format.
  console.log("\n--- ALL VISIBLE BUTTONS WITH 'YouTube' OR 'format' OR 'data' ---");
  const buttons = await page.getByRole("button").all();
  for (const b of buttons) {
    if (!(await b.isVisible().catch(() => false))) continue;
    const name = (await b.getAttribute("aria-label")) || (await b.innerText().catch(() => "")) || "";
    if (/youtube|format|data|history/i.test(name)) {
      const disabled = await b.getAttribute("disabled");
      const dataDisabled = await b.getAttribute("aria-disabled");
      console.log(`  ${disabled || dataDisabled === "true" ? "[disabled]" : "[enabled] "} ${name.slice(0, 120)}`);
    }
  }

  // Open the subset dialog
  console.log("\n[inspect] Opening subset dialog");
  await page
    .getByRole("button", { name: /All YouTube data included|\d+ data types? selected/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(DEBUG_DIR, "inspect-01-subset.png"), fullPage: false });

  console.log("\n--- SUBSET DIALOG: visible checkboxes ---");
  const cbs = await page.getByRole("checkbox").all();
  for (const cb of cbs) {
    if (!(await cb.isVisible().catch(() => false))) continue;
    const name = (await cb.getAttribute("aria-label")) || "";
    console.log(`  ${name}`);
  }

  // Look for format selects inside the subset dialog (maybe format is per-subtype here)
  console.log("\n--- VISIBLE <select> ELEMENTS ON PAGE ---");
  const selects = await page.locator("select").all();
  for (const s of selects) {
    if (!(await s.isVisible().catch(() => false))) continue;
    const label = (await s.getAttribute("aria-label")) || (await s.getAttribute("name")) || "(no label)";
    const value = await s.inputValue().catch(() => "?");
    const opts = await s.locator("option").allTextContents();
    console.log(`  select [${label}] value=${value} options=[${opts.join(", ")}]`);
  }

  // Take an HTML dump of the open dialog
  const dialog = page.getByRole("dialog").first();
  if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const html = await dialog.innerHTML();
    fs.writeFileSync(path.join(DEBUG_DIR, "inspect-subset-dialog.html"), html);
    console.log("\n[inspect] Wrote subset dialog HTML to inspect-subset-dialog.html");
  }

  // Close it
  const dlgOk = page.getByRole("button", { name: /^OK$/i }).last();
  if (await dlgOk.isVisible({ timeout: 1000 }).catch(() => false)) await dlgOk.click();
  await page.waitForTimeout(1000);

  // Now try the formats button
  console.log("\n[inspect] Opening formats dialog");
  const fmtBtn = page
    .getByRole("button", { name: /Multiple formats for YouTube/i })
    .first();
  if (await fmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fmtBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DEBUG_DIR, "inspect-02-formats.png"), fullPage: false });

    console.log("\n--- FORMATS DIALOG: <select> elements ---");
    const fsels = await page.locator("select").all();
    for (const s of fsels) {
      if (!(await s.isVisible().catch(() => false))) continue;
      const label = (await s.getAttribute("aria-label")) || (await s.getAttribute("name")) || "(no label)";
      const value = await s.inputValue().catch(() => "?");
      const opts = await s.locator("option").allTextContents();
      console.log(`  select [${label}] value=${value} options=[${opts.join(", ")}]`);
    }

    const fdialog = page.getByRole("dialog").first();
    if (await fdialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      const html = await fdialog.innerHTML();
      fs.writeFileSync(path.join(DEBUG_DIR, "inspect-formats-dialog.html"), html);
      console.log("[inspect] Wrote formats dialog HTML to inspect-formats-dialog.html");
    }
  } else {
    console.log("[inspect] Multiple-formats button NOT VISIBLE — format may not be selectable per-product");
  }

  await close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("inspect crashed:", err);
  await close().catch(() => {});
  process.exit(1);
});
