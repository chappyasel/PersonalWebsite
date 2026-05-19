/**
 * List all enabled buttons + their aria-labels on takeout.google.com/manage.
 * Finds the right Download selector.
 */

import { getPage, close, hasGoogleSessionCookies } from "./browser";

async function main() {
  if (!hasGoogleSessionCookies()) {
    console.error("Not logged in.");
    process.exit(1);
  }
  const page = await getPage({ headless: true });
  await page.goto("https://takeout.google.com/manage", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(4000);

  const buttons = await page.getByRole("button").all();
  console.log(`\n--- ${buttons.length} buttons on /manage ---\n`);
  for (const b of buttons) {
    if (!(await b.isVisible().catch(() => false))) continue;
    const aria = (await b.getAttribute("aria-label")) || "";
    const text = (await b.innerText().catch(() => "")) || "";
    const disabled = (await b.getAttribute("disabled")) || (await b.getAttribute("aria-disabled"));
    console.log(`  ${disabled ? "[dis]" : "[ena]"}  aria="${aria.slice(0, 80)}"  text="${text.replace(/\n/g, " ").slice(0, 60)}"`);
  }

  // Look for links too — download might be an anchor
  const links = await page.getByRole("link").all();
  console.log(`\n--- ${links.length} links on /manage (filtered to relevant) ---\n`);
  for (const l of links) {
    if (!(await l.isVisible().catch(() => false))) continue;
    const aria = (await l.getAttribute("aria-label")) || "";
    const text = (await l.innerText().catch(() => "")) || "";
    const href = await l.getAttribute("href");
    if (/download|export|youtube/i.test(aria + text + (href || ""))) {
      console.log(`  aria="${aria.slice(0, 80)}"  text="${text.replace(/\n/g, " ").slice(0, 60)}"  href="${(href || "").slice(0, 80)}"`);
    }
  }

  await close();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await close().catch(() => {});
  process.exit(1);
});
