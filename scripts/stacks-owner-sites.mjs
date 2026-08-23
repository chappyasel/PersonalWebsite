// Ad-hoc measurement aid: dump every interaction owner's Unit-local bounding
// box, for finding roughly WHERE to aim a new Perch's probe.
//
// The box is never the anchor. Perch anchors are authored from measured
// contacts — a raycast onto the owner's real triangles, read back off the dev
// bridge — because a box top can sit well above any surface a probe can hit
// (the retired sailboat's mast shared one mesh with its hull and its box top
// was 13 cm proud of the mast; the lighthouse tower's box reaches its lantern
// floor). This only narrows the search.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const MATCH = process.env.STACKS_MATCH
  ? new RegExp(process.env.STACKS_MATCH)
  : null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.__stacksInsects?.owners),
  null,
  {
    timeout: 90000,
  },
);

const out = {};
for (let unit = 0; unit < 7; unit++) {
  await page.evaluate(
    (u) => window.__stacks?.scrollTo(u, { instant: true }),
    unit,
  );
  await page.waitForTimeout(6000);
  const sites = await page.evaluate(
    (u) => window.__stacksInsects.owners(u),
    unit,
  );
  out[unit] = MATCH ? sites.filter((site) => MATCH.test(site.id)) : sites;
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
