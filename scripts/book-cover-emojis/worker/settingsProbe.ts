#!/usr/bin/env tsx
/** Read-only: report what the Notion settings UI actually exposes. No writes. */
import { closeSession, listSpaces, openSession } from "./browser";
import { COOKIE_QUERY, arcCookieKey, shapeCookies, type CookieRow } from "./cookies";
import { copyFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function rows(): CookieRow[] {
  const source = join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cookies");
  const snap = join(tmpdir(), `settings-probe-${process.pid}.sqlite`);
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

const session = await openSession(shapeCookies(rows(), arcCookieKey()));
try {
  await session.page.goto("https://www.notion.so/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await session.page.waitForTimeout(4000);
  console.log("spaces:", JSON.stringify(await listSpaces(session.page)));

  await session.page.goto("https://app.notion.com/library/recents?space=chappyasel", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await session.page.waitForTimeout(7000);

  const settingsLinks = await session.page
    .getByText("Settings", { exact: false })
    .allInnerTexts()
    .catch(() => []);
  console.log(`inline "Settings" texts: ${settingsLinks.slice(0, 10).join(" | ") || "(none)"}`);

  // Try the account/space menu at the bottom of the sidebar.
  for (const selector of [
    '[data-testid="sidebar-switcher"]',
    ".notion-sidebar-switcher",
    '[aria-label*="account" i]',
    '[aria-label*="settings" i]',
    '[aria-label*="workspace" i]',
  ]) {
    const locator = session.page.locator(selector).first();
    if (!(await locator.isVisible().catch(() => false))) {
      console.log(`selector ${selector}: not visible`);
      continue;
    }
    console.log(`selector ${selector}: visible, clicking`);
    await locator.click().catch(() => undefined);
    await session.page.waitForTimeout(2500);
    const menu = await session.page.locator("body").innerText().catch(() => "");
    console.log(`  menu mentions Settings: ${/settings/i.test(menu) ? "yes" : "no"}`);
    const item = session.page.getByText("Settings", { exact: true }).first();
    if (await item.isVisible().catch(() => false)) {
      await item.click().catch(() => undefined);
      await session.page.waitForTimeout(5000);
      const after = await session.page.locator("body").innerText().catch(() => "");
      console.log(`  after clicking Settings -> ${session.page.url()}`);
      console.log(`  mentions Emoji: ${/emoji/i.test(after) ? "yes" : "no"}`);
      const tabs = await session.page.getByRole("tab").allInnerTexts().catch(() => []);
      console.log(`  tabs: ${tabs.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30).join(" | ")}`);
      break;
    }
  }
} finally {
  await closeSession(session);
}
