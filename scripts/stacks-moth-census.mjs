// Ad-hoc: do moths land, and where?
//
// Moths only land while their lamp is lit, so this switches to the dark theme
// first — measuring them in daylight measures nothing.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNIT = Number(process.env.STACKS_UNIT ?? 3);
const SECONDS = Number(process.env.STACKS_SECONDS ?? 150);

const browser = await chromium.launch({
  headless: true,
  args: ["--force-dark-mode"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
});
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
// The theme crossfade and the lamps' eased lit factor both need a moment.
await page.waitForTimeout(9000);

const phases = new Map();
const restedOn = new Set();
const mothEligible = new Set();
let samples = 0;
let litCones = 0;
let coneSamples = 0;

const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const frame = await page.evaluate(() => {
    const bridge = window.__stacksInsects;
    return {
      moths: bridge.flights
        .map((f) => f.telemetry)
        .filter((t) => t.species === "moth")
        .map((t) => ({ phase: t.phase, perchId: t.perchId ?? null })),
      cones: (bridge.lampCones ?? []).map((c) => c.lit),
      eligible: bridge.diagnostics
        .filter((d) => d.eligibleSpecies.includes("moth"))
        .map((d) => d.perchId),
    };
  });
  for (const moth of frame.moths) {
    samples++;
    phases.set(moth.phase, (phases.get(moth.phase) ?? 0) + 1);
    if (moth.phase === "rest" && moth.perchId) restedOn.add(moth.perchId);
  }
  for (const lit of frame.cones) {
    coneSamples++;
    if (lit) litCones++;
  }
  for (const id of frame.eligible) mothEligible.add(id);
  await page.waitForTimeout(150);
}

const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;
console.log(`${samples} moth-samples over ${SECONDS}s on unit ${UNIT}\n`);
console.log("phase distribution");
for (const [phase, n] of [...phases].sort((a, b) => b[1] - a[1]))
  console.log(
    `  ${phase.padEnd(11)} ${String(n).padStart(6)}  ${pct(n, samples)}`,
  );
console.log(`\nlamps lit        ${pct(litCones, coneSamples)} of cone samples`);
console.log(
  `moth-eligible    ${mothEligible.size} Perches: ${[...mothEligible].join(", ")}`,
);
console.log(`moths rested on  ${[...restedOn].join(", ") || "(NOTHING)"}`);
await browser.close();
