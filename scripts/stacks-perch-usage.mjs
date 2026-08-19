// Ad-hoc: how often is each Perch actually CHOSEN, and what happens next?
//
// "Nothing ever lands on the globe" has two very different causes — never
// selected, or selected and always failing — and a per-frame rejection code
// cannot tell them apart. This counts reservation events and how many reach
// rest.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNIT = Number(process.env.STACKS_UNIT ?? 0);
const SECONDS = Number(process.env.STACKS_SECONDS ?? 180);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.__stacksInsects?.flights),
  null,
  {
    timeout: 120000,
  },
);
await page.evaluate(
  (u) => window.__stacks?.scrollTo(u, { instant: true }),
  UNIT,
);
await page.waitForTimeout(6000);

// perchId -> { claims, rested, phases:Set, lastOccupant }
const usage = new Map();
const entry = (id) => {
  let row = usage.get(id);
  if (!row) {
    row = {
      claims: 0,
      rested: 0,
      phases: new Set(),
      holders: new Set(),
      last: null,
    };
    usage.set(id, row);
  }
  return row;
};

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const rows = await page.evaluate(() =>
    window.__stacksInsects.flights
      .map((f) => f.telemetry)
      .filter((t) => t.perchId)
      .map((t) => ({ perchId: t.perchId, who: t.occupantId, phase: t.phase })),
  );
  for (const row of rows) {
    const record = entry(row.perchId);
    record.phases.add(row.phase);
    // A new holder is a new claim: reservations are exclusive, so the occupant
    // changing means the previous attempt ended one way or another.
    const key = `${row.who}`;
    if (!record.holders.has(key)) {
      record.holders.add(key);
      record.claims++;
    }
    if (row.phase === "rest") record.rested++;
  }
  await page.waitForTimeout(120);
}

const rows = [...usage.entries()].sort((a, b) => b[1].claims - a[1].claims);
console.log(`Perch usage on unit ${UNIT} over ${SECONDS}s\n`);
console.log(
  "perch                                 claims  rest-samples  phases",
);
for (const [id, row] of rows)
  console.log(
    `${id.padEnd(36)} ${String(row.claims).padStart(6)} ${String(row.rested).padStart(13)}  ${[...row.phases].join(",")}`,
  );

const all = await page.evaluate(
  (u) =>
    window.__stacksInsects.diagnostics
      .filter((d) => d.unitIndex === u)
      .map((d) => d.perchId),
  UNIT,
);
const untouched = all.filter((id) => !usage.has(id));
console.log(
  `\nnever claimed on this Unit: ${untouched.join(", ") || "(none)"}`,
);
await browser.close();
