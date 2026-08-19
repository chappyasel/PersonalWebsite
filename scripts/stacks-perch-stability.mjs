// Ad-hoc: which Perches flicker, and is it the SITE or the PROP that moves?
//
// "The barbell is also red sometimes randomly" and "the boat keeps going red
// intermittently" are both reports about a verdict that CHANGES, and a
// single-sample census cannot see change at all. This samples every Perch on a
// Unit fast enough to catch the transitions, and separately tracks how far each
// resolved contact travels between samples — because a Perch on a prop that is
// spinning or swaying is a different problem from one that is merely blocked.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const UNITS = (process.env.STACKS_UNITS ?? process.env.STACKS_UNIT ?? "0")
  .split(",")
  .map((value) => Number(value.trim()));
const SECONDS = Number(process.env.STACKS_SECONDS ?? 60);

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
for (const UNIT of UNITS) {
  await page.evaluate(
    (u) => window.__stacks?.scrollTo(u, { instant: true }),
    UNIT,
  );
  await page.waitForTimeout(6000);
  /** perchId -> { codes: Map, samples, moved: max metres between samples, travel, last } */
  const rows = new Map();
  const revisions = new Set();
  let ticks = 0;

  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    let frame;
    try {
      frame = await page.evaluate(
        (u) =>
          window.__stacksInsects.diagnostics
            .filter((d) => d.unitIndex === u)
            .map((d) => ({
              perchId: d.perchId,
              code: d.rejectionCode,
              disposition: d.disposition,
              contact: d.resolvedContact,
              revision: d.collisionRevision,
              blockedBy: d.restingPoseBlockedBy ?? d.routeBlockedBy ?? null,
            })),
        UNIT,
      );
    } catch {
      // An HMR reload destroys the execution context mid-poll; settle and retry.
      await page.waitForTimeout(1500);
      continue;
    }
    ticks++;
    for (const entry of frame) {
      let row = rows.get(entry.perchId);
      if (!row) {
        row = {
          codes: new Map(),
          blockers: new Map(),
          samples: 0,
          moved: 0,
          travel: 0,
          last: null,
        };
        rows.set(entry.perchId, row);
      }
      row.samples++;
      row.codes.set(entry.code, (row.codes.get(entry.code) ?? 0) + 1);
      if (entry.blockedBy)
        row.blockers.set(
          entry.blockedBy,
          (row.blockers.get(entry.blockedBy) ?? 0) + 1,
        );
      if (entry.revision != null) revisions.add(entry.revision);
      if (entry.contact) {
        if (row.last) {
          const step = Math.hypot(
            entry.contact.x - row.last.x,
            entry.contact.y - row.last.y,
            entry.contact.z - row.last.z,
          );
          row.moved = Math.max(row.moved, step);
          row.travel += step;
        }
        row.last = entry.contact;
      }
    }
    await page.waitForTimeout(100);
  }

  const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
  console.log(
    `unit ${UNIT} · ${ticks} ticks over ${SECONDS}s · ${revisions.size} distinct collision revisions\n`,
  );
  console.log(
    "perch                          ready   worst-step  travel   codes",
  );
  for (const [id, row] of [...rows].sort(
    (a, b) => (b[1].codes.get("none") ?? 0) - (a[1].codes.get("none") ?? 0),
  )) {
    const codes = [...row.codes]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `${code}:${pct(n, row.samples)}`)
      .join(" ");
    console.log(
      `${id.padEnd(30)} ${pct(row.codes.get("none") ?? 0, row.samples).padStart(5)}  ` +
        `${row.moved.toFixed(4).padStart(9)}m ${row.travel.toFixed(3).padStart(7)}m  ${codes}`,
    );
    const blockers = [...row.blockers].sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (blockers.length)
      console.log(
        `${" ".repeat(30)} blocked by ${blockers.map(([b, n]) => `${b} (${pct(n, row.samples)})`).join(", ")}`,
      );
  }
}
await browser.close();
