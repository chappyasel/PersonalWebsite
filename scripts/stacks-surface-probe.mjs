// Ad-hoc: print the top surface of one prop as a grid, in its Unit's own frame.
// Use it to choose a Perch anchor that is ON a surface with headroom, rather
// than inferring one from a bounding box and finding out a page load later.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const OWNER = process.env.STACKS_OWNER;
const UNIT = Number(process.env.STACKS_UNIT ?? 0);
const STEPS = Number(process.env.STACKS_STEPS ?? 9);
if (!OWNER) throw new Error("set STACKS_OWNER");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__stacksInsects?.probe), null, {
  timeout: 90000,
});
// Props on a shelf load lazily, and a probe that arrives before they do reports
// "no visible bounds" — which is indistinguishable from the real defect this
// script exists to investigate. Walk the room first, then settle on the target.
for (let unit = 0; unit < 7; unit++) {
  await page.evaluate(
    (u) => window.__stacks?.scrollTo(u, { instant: true }),
    unit,
  );
  await page.waitForTimeout(2500);
}
await page.evaluate(
  (u) => window.__stacks?.scrollTo(u, { instant: true }),
  UNIT,
);
await page.waitForTimeout(9000);

const rows = await page.evaluate(
  ({ unit, owner, steps }) => window.__stacksInsects.probe(unit, owner, steps),
  { unit: UNIT, owner: OWNER, steps: STEPS },
);
if (!rows) {
  console.log(`${OWNER}: not mounted on unit ${UNIT}, or no visible bounds`);
} else {
  rows.sort((a, b) => b.local[1] - a.local[1]);
  console.log(
    `${OWNER} on unit ${UNIT}: ${rows.length} surface hits, highest first`,
  );
  for (const row of rows.slice(0, Number(process.env.STACKS_TOP ?? 24)))
    console.log(
      `  [${row.local.join(", ")}]  n=[${row.normal.join(", ")}]  below-box-top=${row.clear}`,
    );
}
await browser.close();
