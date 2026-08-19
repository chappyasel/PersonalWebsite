// Ad-hoc: why does one interaction owner have no measurable bounds?
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const OWNER = process.env.STACKS_OWNER ?? "egg:globe";
const UNIT = Number(process.env.STACKS_UNIT ?? 0);

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
await page.evaluate(
  (u) => window.__stacks?.scrollTo(u, { instant: true }),
  UNIT,
);
await page.waitForTimeout(7000);

const report = await page.evaluate(
  ({ owner, unit }) => {
    const sites = window.__stacksInsects.owners(unit);
    const match = sites.filter((site) => site.id === owner);
    const dup = sites.filter((site) => site.id === owner).length;
    return { match, duplicates: dup, allIds: sites.map((s) => s.id) };
  },
  { owner: OWNER, unit: UNIT },
);
console.log(JSON.stringify(report, null, 1));
await browser.close();
