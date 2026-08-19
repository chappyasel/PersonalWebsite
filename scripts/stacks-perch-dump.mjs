// Ad-hoc: walk every Unit and dump each Perch's live rejection code.
//
// The per-Perch watch answers "is this one site healthy". This answers the
// question that actually matters when the HUD is red everywhere: which sites
// are blocked, and do they share a cause.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNITS = Number(process.env.STACKS_UNITS ?? 7);
const SETTLE = Number(process.env.STACKS_SETTLE ?? 4500);
const REPEATS = Number(process.env.STACKS_REPEATS ?? 6);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__stacksInsects?.diagnostics), null, {
  timeout: 120000,
});

// perchId -> code -> count, so a site that flickers is distinguishable from a
// site that is simply blocked.
const seen = new Map();

for (let unit = 0; unit < UNITS; unit++) {
  await page.evaluate((u) => window.__stacks?.scrollTo(u, { instant: true }), unit);
  await page.waitForTimeout(SETTLE);
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const rows = await page.evaluate(() =>
      window.__stacksInsects.diagnostics.map((d) => ({
        perchId: d.perchId,
        unitIndex: d.unitIndex,
        code: d.rejectionCode,
        species: d.species,
      })),
    );
    for (const row of rows) {
      if (!seen.has(row.perchId))
        seen.set(row.perchId, { unit: row.unitIndex, species: row.species, codes: new Map() });
      const entry = seen.get(row.perchId);
      entry.codes.set(row.code, (entry.codes.get(row.code) ?? 0) + 1);
    }
    await page.waitForTimeout(400);
  }
}

const totals = new Map();
const rows = [...seen.entries()].sort((a, b) => (a[1].unit - b[1].unit) || a[0].localeCompare(b[0]));
let healthy = 0;
console.log(`${rows.length} Perches\n`);
for (const [perchId, entry] of rows) {
  const codes = [...entry.codes].sort((a, b) => b[1] - a[1]);
  const dominant = codes[0][0];
  const total = codes.reduce((sum, [, n]) => sum + n, 0);
  const readyShare = (entry.codes.get("none") ?? 0) / total;
  if (readyShare >= 0.999) healthy++;
  totals.set(dominant, (totals.get(dominant) ?? 0) + 1);
  const flag = readyShare >= 0.999 ? "  " : readyShare > 0 ? "~ " : "X ";
  console.log(
    `${flag}${perchId.padEnd(34)} ready ${String(Math.round(readyShare * 100)).padStart(3)}%  ${codes
      .map(([k, v]) => `${k}:${v}`)
      .join(" ")}`,
  );
}
console.log(`\nalways ready      ${healthy}/${rows.length}`);
console.log(
  `dominant codes    ${[...totals].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ")}`,
);
await browser.close();
