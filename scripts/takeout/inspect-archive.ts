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
  await page.waitForTimeout(3000);

  // Find the "Completed" archive link.
  const allLinks = await page.getByRole("link").all();
  let completedHref: string | null = null;
  for (const l of allLinks) {
    const text = (await l.innerText().catch(() => "")) || "";
    const href = await l.getAttribute("href");
    if (/Completed/i.test(text) && href?.includes("/manage/archive/")) {
      completedHref = href;
      console.log(`Found completed archive link: ${href}`);
      break;
    }
  }
  if (!completedHref) {
    console.error("No completed archive link found.");
    process.exit(1);
  }

  await page.goto(new URL(completedHref, "https://takeout.google.com/").toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);

  console.log(`\n--- ARCHIVE DETAIL PAGE: ${page.url()} ---\n`);

  const buttons = await page.getByRole("button").all();
  console.log(`-- ${buttons.length} buttons --`);
  for (const b of buttons) {
    if (!(await b.isVisible().catch(() => false))) continue;
    const aria = (await b.getAttribute("aria-label")) || "";
    const text = (await b.innerText().catch(() => "")) || "";
    console.log(`  aria="${aria.slice(0, 80)}"  text="${text.replace(/\n/g, " ").slice(0, 60)}"`);
  }

  const links = await page.getByRole("link").all();
  console.log(`\n-- ${links.length} links (download-relevant) --`);
  for (const l of links) {
    if (!(await l.isVisible().catch(() => false))) continue;
    const aria = (await l.getAttribute("aria-label")) || "";
    const text = (await l.innerText().catch(() => "")) || "";
    const href = await l.getAttribute("href");
    if (/download|\.zip|googleusercontent/i.test(aria + text + (href || ""))) {
      console.log(`  aria="${aria.slice(0, 80)}"  text="${text.slice(0, 40)}"  href="${(href || "").slice(0, 100)}"`);
    }
  }

  // Also dump the visible text on the page
  console.log("\n--- PAGE TEXT ---");
  console.log((await page.locator("body").innerText()).slice(0, 1500));

  await close();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await close().catch(() => {});
  process.exit(1);
});
