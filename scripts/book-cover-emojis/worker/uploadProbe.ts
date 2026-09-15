#!/usr/bin/env tsx
/**
 * Read-only inspection of the Add-emoji dialog. Never clicks Save, so nothing
 * is created. Dumps roles, labels and placeholders, and writes screenshots.
 */
import { closeSession, openEmojiSettings, openSession } from "./browser";
import { COOKIE_QUERY, arcCookieKey, shapeCookies, type CookieRow } from "./cookies";
import { paths } from "./state";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Page } from "playwright";

const WORKSPACE_ID = "859fbc85-7644-4498-88d8-e0229d8cea32";
const SHOT_DIR = join(paths.root, "diagnostics");

function rows(): CookieRow[] {
  const source = join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cookies");
  const snap = join(tmpdir(), `upload-probe-${process.pid}.sqlite`);
  copyFileSync(source, snap);
  try {
    const db = new DatabaseSync(snap, { readOnly: true });
    const st = db.prepare(COOKIE_QUERY);
    st.setReadBigInts(true);
    const out = st.all() as unknown as CookieRow[];
    db.close();
    return out;
  } finally {
    rmSync(snap, { force: true });
  }
}

async function dump(page: Page, label: string): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();

  for (const role of ["textbox", "button", "tab", "dialog"] as const) {
    const texts = await page.getByRole(role).allInnerTexts().catch(() => []);
    const shown = texts.map(clean).filter(Boolean).slice(0, 25);
    console.log(`  role=${role} (${texts.length}): ${shown.join(" | ") || "(no inner text)"}`);
  }

  // Inner text is empty for inputs, so read their attributes directly.
  const inputs = await page.evaluate(() => {
    const out: Array<Record<string, string>> = [];
    document.querySelectorAll("input, textarea, [contenteditable='true']").forEach((el) => {
      const rect = el.getBoundingClientRect();
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") ?? "",
        placeholder: el.getAttribute("placeholder") ?? "",
        ariaLabel: el.getAttribute("aria-label") ?? "",
        ariaLabelledBy: el.getAttribute("aria-labelledby") ?? "",
        name: el.getAttribute("name") ?? "",
        id: el.getAttribute("id") ?? "",
        role: el.getAttribute("role") ?? "",
        dataTestId: el.getAttribute("data-testid") ?? "",
        visible: String(rect.width > 0 && rect.height > 0),
      });
    });
    return out;
  });
  console.log(`  inputs/editables (${inputs.length}):`);
  for (const input of inputs) {
    console.log(`    ${JSON.stringify(input)}`);
  }

  mkdirSync(SHOT_DIR, { recursive: true });
  const shot = join(SHOT_DIR, `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`  screenshot: ${shot}`);
}

const asset = process.argv[2];
if (!asset) throw new Error("usage: uploadProbe <path-to-png>");

const session = await openSession(shapeCookies(rows(), arcCookieKey()));
try {
  await openEmojiSettings(session.page, WORKSPACE_ID);
  console.log("emoji settings reached");

  const add = session.page.getByRole("button", { name: "Add emoji", exact: true }).first();
  await add.click();
  await session.page.waitForTimeout(2500);
  await dump(session.page, "after Add emoji");

  // Find whatever control opens the file chooser.
  const buttons = await session.page.getByRole("button").allInnerTexts().catch(() => []);
  console.log(`\nbuttons after Add emoji: ${buttons.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ")}`);

  const uploadCandidates = ["Upload an image", "Upload image", "Upload", "Choose file"];
  let opened = false;
  for (const name of uploadCandidates) {
    const control = session.page.getByRole("button", { name, exact: true }).first();
    if (!(await control.isVisible().catch(() => false))) continue;
    console.log(`\nusing upload control: "${name}"`);
    const [chooser] = await Promise.all([
      session.page.waitForEvent("filechooser", { timeout: 20_000 }),
      control.click(),
    ]);
    await chooser.setFiles(asset);
    opened = true;
    break;
  }
  if (!opened) {
    // Fall back to the raw file input, which some builds render directly.
    const fileInput = session.page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      console.log("\nno upload button matched; setting files on input[type=file]");
      await fileInput.setInputFiles(asset);
      opened = true;
    }
  }
  if (!opened) throw new Error("could not find any way to choose a file");

  await session.page.waitForTimeout(4000);
  await dump(session.page, "after setFiles");
} finally {
  await closeSession(session);
}
console.log("\nprobe made no writes; Save was never clicked.");
