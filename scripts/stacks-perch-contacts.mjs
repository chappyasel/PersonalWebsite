// Ad-hoc: read the RESOLVED contact of one or more Perches off the dev bridge,
// in the Unit-local frame the catalogue is authored in.
//
// This is the second half of authoring a Perch. The anchor you write is
// advisory once `ownerId` is explicit — the resolver raycasts the owner's real
// triangles and picks the best normal-matching hit — so the number that belongs
// in `insectPerches.tsx` is the one that comes back out here, never the one you
// guessed and never a bounding-box corner.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const MATCH = new RegExp(process.env.STACKS_MATCH ?? ".");
const UNITS = (process.env.STACKS_UNITS ?? "0,1,2,3,4,5,6")
  .split(",")
  .map(Number);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.__stacksInsects?.toUnitLocal),
  null,
  { timeout: 90000 },
);

const round = (v) => (v == null ? null : Number(v.toFixed(4)));
for (const unit of UNITS) {
  await page.evaluate(
    (u) => window.__stacks?.scrollTo(u, { instant: true }),
    unit,
  );
  await page.waitForTimeout(7000);
  const rows = await page.evaluate(() => {
    const bridge = window.__stacksInsects;
    return bridge.diagnostics.map((d) => ({
      id: d.perchId,
      unit: d.unitIndex,
      local: bridge.toUnitLocal(d.unitIndex, d.resolvedContact),
      world: d.resolvedContact,
      normal: d.normal,
      tangent: d.tangent,
      code: d.rejectionCode,
      reason: d.rejectionReason,
    }));
  });
  for (const row of rows.filter((r) => MATCH.test(r.id))) {
    const point = row.local ?? row.world;
    console.log(
      `unit ${row.unit} ${row.id.padEnd(34)} ${row.code.padEnd(22)} ` +
        (point
          ? `[${round(point.x)}, ${round(point.y)}, ${round(point.z)}] n=[${round(row.normal?.x)}, ${round(row.normal?.y)}, ${round(row.normal?.z)}] t=[${round(row.tangent?.x)}, ${round(row.tangent?.y)}, ${round(row.tangent?.z)}]`
          : "unresolved") +
        (row.local ? "" : "  (WORLD — no local converter on the bridge)"),
    );
  }
}
await browser.close();
