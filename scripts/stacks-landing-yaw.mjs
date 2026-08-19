// Ad-hoc: does a landing insect's facing oscillate as it settles?
//
// "Spazzing back and forth" is REVERSALS, not total rotation — a large smooth
// turn is fine and a small hunting one is not, so magnitude alone cannot answer
// it. This samples the rendered yaw at high rate and counts direction changes
// per phase.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNIT = Number(process.env.STACKS_UNIT ?? 1);
const SECONDS = Number(process.env.STACKS_SECONDS ?? 120);
// Ignore turns below this per sample; sampling jitter is not a reversal.
const DEAD_RAD = Number(process.env.STACKS_DEAD ?? 0.004);

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

// occupantId -> { lastYaw, lastSign, perPhase }
const tracks = new Map();
const wrapPi = (a) =>
  ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const rows = await page.evaluate(() =>
    window.__stacksInsects.flights
      .map((f) => f.telemetry)
      .filter((t) => t.yaw != null)
      .map((t) => ({
        id: t.occupantId,
        yaw: t.yaw,
        phase: t.phase,
        speed: t.speed,
      })),
  );
  for (const row of rows) {
    let track = tracks.get(row.id);
    if (!track) {
      track = { lastYaw: row.yaw, lastSign: 0, phases: new Map() };
      tracks.set(row.id, track);
    }
    const delta = wrapPi(row.yaw - track.lastYaw);
    track.lastYaw = row.yaw;
    if (Math.abs(delta) < DEAD_RAD) continue;
    const sign = Math.sign(delta);
    let bucket = track.phases.get(row.phase);
    if (!bucket) {
      bucket = { turned: 0, reversals: 0, samples: 0 };
      track.phases.set(row.phase, bucket);
    }
    bucket.samples++;
    bucket.turned += Math.abs(delta);
    if (track.lastSign !== 0 && sign !== track.lastSign) bucket.reversals++;
    track.lastSign = sign;
  }
  await page.waitForTimeout(40);
}

const totals = new Map();
for (const track of tracks.values())
  for (const [phase, bucket] of track.phases) {
    const t = totals.get(phase) ?? { turned: 0, reversals: 0, samples: 0 };
    t.turned += bucket.turned;
    t.reversals += bucket.reversals;
    t.samples += bucket.samples;
    totals.set(phase, t);
  }

console.log(`${tracks.size} insects tracked over ${SECONDS}s\n`);
console.log("phase        turned(rad)  reversals  reversals/s-of-turning");
for (const phase of [
  "roam",
  "approach",
  "hover",
  "touchdown",
  "rest",
  "launch",
  "rejoin",
]) {
  const t = totals.get(phase);
  if (!t) continue;
  // Reversals per radian actually turned: a fair comparison between a phase
  // that turns a lot and one that barely turns at all.
  const density = t.turned > 0 ? t.reversals / t.turned : 0;
  console.log(
    `${phase.padEnd(12)} ${t.turned.toFixed(2).padStart(10)} ${String(t.reversals).padStart(10)} ${density.toFixed(2).padStart(12)}`,
  );
}
await browser.close();
