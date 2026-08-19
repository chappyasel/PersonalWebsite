// Ad-hoc: what are the insects actually DOING?
//
// A per-Perch view answers "is this site healthy" and can miss the blunter
// question entirely: is anything completing a landing anywhere in the room.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNIT = Number(process.env.STACKS_UNIT ?? 1);
const SECONDS = Number(process.env.STACKS_SECONDS ?? 120);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.__stacksInsects?.flights),
  null,
  { timeout: 120000 },
);
await page.evaluate(
  (u) => window.__stacks?.scrollTo(u, { instant: true }),
  UNIT,
);
await page.waitForTimeout(6000);

const phases = new Map();
const events = new Map();
const rejections = new Map();
const restedOn = new Set();
let samples = 0;

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const rows = await page.evaluate(() =>
    window.__stacksInsects.flights.map((f) => ({
      phase: f.telemetry.phase,
      event: f.telemetry.event ?? null,
      rejection: f.telemetry.rejectionCode ?? null,
      perchId: f.telemetry.perchId ?? null,
      species: f.telemetry.species ?? "butterfly",
    })),
  );
  for (const row of rows) {
    samples++;
    phases.set(row.phase, (phases.get(row.phase) ?? 0) + 1);
    if (row.event) events.set(row.event, (events.get(row.event) ?? 0) + 1);
    if (row.rejection && row.rejection !== "none")
      rejections.set(row.rejection, (rejections.get(row.rejection) ?? 0) + 1);
    if (row.phase === "rest" && row.perchId) restedOn.add(row.perchId);
  }
  await page.waitForTimeout(150);
}

const pct = (n) => `${((n / Math.max(1, samples)) * 100).toFixed(1)}%`;
console.log(`${samples} insect-samples over ${SECONDS}s\n`);
console.log("phase distribution");
for (const [phase, n] of [...phases].sort((a, b) => b[1] - a[1]))
  console.log(`  ${phase.padEnd(11)} ${String(n).padStart(6)}  ${pct(n)}`);
console.log(
  `\npilot events     ${
    [...events]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "(none)"
  }`,
);
console.log(
  `rejection codes  ${
    [...rejections]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "(none)"
  }`,
);
console.log(`rested on        ${[...restedOn].join(", ") || "(NOTHING)"}`);

// What refused the most candidate routes, per Perch on this Unit. Only sites
// that actually had a failed compilation during the window report one.
const blockers = await page.evaluate((u) => {
  const bridge = window.__stacksInsects;
  return bridge.diagnostics
    .filter((d) => d.unitIndex === u && d.routeBlockedBy)
    .map((d) => {
      const described = bridge.describeBox(u, d.routeBlockedBy);
      return {
        perchId: d.perchId,
        boxId: d.routeBlockedBy,
        ownedBy: described?.ownedBy ?? null,
        size: described?.bounds
          ? described.bounds.max.map((v, i) =>
              Number((v - described.bounds.min[i]).toFixed(3)),
            )
          : null,
      };
    });
}, UNIT);
console.log("\nroute blockers (most-refusing collider per Perch)");
if (blockers.length === 0) console.log("  (no failed compilations recorded)");
for (const row of blockers)
  console.log(
    `  ${row.perchId.padEnd(28)} ${row.ownedBy ?? "(unowned)"} size=${row.size ? `[${row.size.join(", ")}]` : "?"}`,
  );
await browser.close();
