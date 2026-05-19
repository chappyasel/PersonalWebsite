/**
 * One-shot: navigate to takeout.google.com/manage, screenshot, and dump the
 * page's text content so we can see what the current in-progress export's
 * file format is.
 *
 * Run with: npx tsx scripts/takeout/inspect-manage.ts
 */

import { getPage, close, hasGoogleSessionCookies } from "./browser";
import * as path from "path";
import * as os from "os";

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

  const outPath = path.join(os.homedir(), ".local/share/youtube-takeout/debug/manage.png");
  await import("fs").then(({ mkdirSync }) => mkdirSync(path.dirname(outPath), { recursive: true }));
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`screenshot: ${outPath}`);

  const text = await page.locator("body").innerText();
  console.log("\n--- PAGE TEXT ---\n");
  console.log(text);

  await close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("inspect failed:", err);
  await close().catch(() => {});
  process.exit(1);
});
