// Ad-hoc: sit on one Unit and watch a single Perch over time.
//
// "Resolves" and "gets landed on" are different questions, and the perch check
// answers the first. This answers the second: how often the Perch is ready, who
// reserves it, whether anyone reaches rest on it, and — for a Perch on a prop
// that moves — how far its contact point travels while all that is happening.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const PERCH = process.env.STACKS_PERCH;
const UNIT = Number(process.env.STACKS_UNIT ?? 0);
const SECONDS = Number(process.env.STACKS_SECONDS ?? 90);
if (!PERCH) throw new Error("set STACKS_PERCH");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__stacksInsects?.diagnostics), null, {
  timeout: 90000,
});
await page.evaluate((u) => window.__stacks?.scrollTo(u, { instant: true }), UNIT);
await page.waitForTimeout(6000);

const codes = new Map();
const phases = new Map();
const reservedBy = new Set();
let samples = 0;
let ready = 0;
let occupiedSamples = 0;
let contactTravel = 0;
let previous = null;

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const row = await page.evaluate((id) => {
    const bridge = window.__stacksInsects;
    const d = bridge.diagnostics.find((x) => x.perchId === id);
    const flights = bridge.flights
      .filter((f) => f.telemetry.perchId === id)
      .map((f) => ({ who: f.telemetry.occupantId, phase: f.telemetry.phase }));
    return d
      ? { code: d.rejectionCode, occupant: d.occupantId, contact: d.resolvedContact, flights }
      : null;
  }, PERCH);
  if (row) {
    samples++;
    codes.set(row.code, (codes.get(row.code) ?? 0) + 1);
    if (row.code === "none") ready++;
    if (row.occupant) occupiedSamples++;
    for (const f of row.flights) {
      reservedBy.add(f.who);
      phases.set(f.phase, (phases.get(f.phase) ?? 0) + 1);
    }
    if (row.contact) {
      if (previous)
        contactTravel += Math.hypot(
          row.contact.x - previous.x,
          row.contact.y - previous.y,
          row.contact.z - previous.z,
        );
      previous = row.contact;
    }
  }
  await page.waitForTimeout(250);
}

const pct = (n) => `${((n / Math.max(1, samples)) * 100).toFixed(0)}%`;
console.log(`${PERCH} over ${SECONDS}s (${samples} samples)`);
console.log(`  ready            ${pct(ready)}`);
console.log(`  occupied         ${pct(occupiedSamples)}`);
console.log(`  rejection codes  ${[...codes].map(([k, v]) => `${k}:${v}`).join(" ")}`);
console.log(`  reserved by      ${[...reservedBy].join(", ") || "(nobody)"}`);
console.log(`  phases seen      ${[...phases].map(([k, v]) => `${k}:${v}`).join(" ") || "(none)"}`);
console.log(`  contact travel   ${contactTravel.toFixed(3)} m (a Perch on a still prop reads ~0)`);
await browser.close();
