#!/usr/bin/env tsx
/** Read-only: why was the sidebar switcher not visible? Makes no writes. */
import { closeSession, listSpaces, openSession } from "./browser";
import { COOKIE_QUERY, arcCookieKey, shapeCookies, type CookieRow } from "./cookies";
import { paths } from "./state";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function rows(): CookieRow[] {
  const source = join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cookies");
  const snap = join(tmpdir(), `sidebar-probe-${process.pid}.sqlite`);
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
const dir = join(paths.root, "diagnostics");
mkdirSync(dir, { recursive: true });
try {
  await session.page.goto("https://app.notion.com/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  for (const wait of [3000, 7000, 15000, 25000]) {
    await session.page.waitForTimeout(wait === 3000 ? 3000 : 4000);
    const total = await session.page.locator(".notion-sidebar-switcher").count();
    let visible = 0;
    for (let i = 0; i < total; i++) {
      if (await session.page.locator(".notion-sidebar-switcher").nth(i).isVisible()) visible++;
    }
    const body = await session.page.locator("body").innerText().catch(() => "");
    console.log(
      `t=${wait}ms url=${session.page.url()} switcher total=${total} visible=${visible} bodyChars=${body.length}`,
    );
    if (visible > 0) break;
  }
  console.log("spaces:", JSON.stringify(await listSpaces(session.page)));
  const shot = join(dir, "sidebar-probe.png");
  await session.page.screenshot({ path: shot });
  console.log("screenshot:", shot);
  const candidates = await session.page.evaluate(() =>
    Array.from(document.querySelectorAll("[class*='sidebar'],[data-testid*='sidebar']"))
      .slice(0, 12)
      .map((el) => ({
        cls: (el.className || "").toString().slice(0, 70),
        testid: el.getAttribute("data-testid") ?? "",
        visible: el.getBoundingClientRect().width > 0,
      })),
  );
  console.log("sidebar-ish elements:");
  for (const c of candidates) console.log("   ", JSON.stringify(c));
} finally {
  await closeSession(session);
}
console.log("probe made no writes.");
