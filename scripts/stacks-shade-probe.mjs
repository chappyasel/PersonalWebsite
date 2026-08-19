// Ad-hoc: what facets does a lamp shade actually present to a downward probe?
//
// Both lamp-shade Perches report `contact-normal-mismatch` on essentially every
// frame. That is a claim about geometry, so measure the geometry rather than
// tune the tolerance again.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNIT = Number(process.env.STACKS_UNIT ?? 3);
const OWNER = process.env.STACKS_OWNER ?? "egg:lamp:3";
const STEPS = Number(process.env.STACKS_STEPS ?? 21);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__stacksInsects?.probe), null, { timeout: 120000 });
await page.evaluate((u) => window.__stacks?.scrollTo(u, { instant: true }), UNIT);
await page.waitForTimeout(6000);

const rows = await page.evaluate(
  ([unit, owner, steps]) => window.__stacksInsects.probe(unit, owner, steps),
  [UNIT, OWNER, STEPS],
);

if (!rows?.length) {
  console.log(`no probe rows for ${OWNER} on unit ${UNIT}`);
} else {
  // Tilt from vertical, which is the number the authored normalTolerance is
  // really about.
  const withTilt = rows.map((r) => ({
    ...r,
    tiltDeg: (Math.acos(Math.min(1, Math.max(-1, r.normal[1]))) * 180) / Math.PI,
  }));
  withTilt.sort((a, b) => a.tiltDeg - b.tiltDeg);
  console.log(`${OWNER} on unit ${UNIT}: ${rows.length} hits\n`);
  console.log("flattest 14 facets (tilt from vertical):");
  for (const r of withTilt.slice(0, 14))
    console.log(
      `  tilt ${r.tiltDeg.toFixed(1).padStart(5)}°  n=[${r.normal.map((v) => v.toFixed(3)).join(", ")}]  local=[${r.local.map((v) => v.toFixed(4)).join(", ")}]  headroom ${r.clear.toFixed(4)}`,
    );
  const buckets = new Map();
  for (const r of withTilt) {
    const b = Math.floor(r.tiltDeg / 10) * 10;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  console.log(
    `\ntilt histogram   ${[...buckets].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}-${k + 10}°:${v}`).join("  ")}`,
  );
  const top = withTilt.reduce((a, b) => (a.local[1] >= b.local[1] ? a : b));
  console.log(
    `highest hit      local=[${top.local.map((v) => v.toFixed(4)).join(", ")}] tilt ${top.tiltDeg.toFixed(1)}°`,
  );
}
await browser.close();
