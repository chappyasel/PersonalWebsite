// Ad-hoc: unit-name -> index map, plus the live state of every lamp Perch.
import { chromium } from "playwright";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__stacksInsects?.diagnostics), null, {
  timeout: 120000,
});

const FILTER = process.env.STACKS_FILTER ?? "lamp";
const targets = await page.evaluate(
  (filter) =>
    window.__stacksInsects.diagnostics
      .filter((d) => d.perchId.includes(filter))
      .map((d) => ({ id: d.perchId, unit: d.unitIndex })),
  FILTER,
);

// Settle on the owning Unit first: a Perch whose prop has not mounted resolves
// to nothing, and reading it at boot measures the loader, not the geometry.
for (const target of targets) {
  await page.evaluate((u) => window.__stacks?.scrollTo(u, { instant: true }), target.unit);
  await page.waitForTimeout(5000);
  const read = () =>
    page.evaluate(
    (id) => {
      const d = window.__stacksInsects.diagnostics.find((x) => x.perchId === id);
      if (!d) return null;
      const toLocal = window.__stacksInsects.toUnitLocal;
      return {
        code: d.rejectionCode,
        owner: d.ownerId,
        worldContact: d.resolvedContact,
        localContact: toLocal(d.unitIndex, d.resolvedContact),
        normal: d.normal,
        tangent: d.tangent,
        blockedBy: d.restingPoseBlockedBy,
        routeBlockedBy: d.routeBlockedBy,
        authored: toLocal(d.unitIndex, d.authoredAnchor),
      };
    },
      target.id,
    );
  // `owner-empty` means the prop has not mounted yet, which measures the
  // loader rather than the geometry. Retry rather than report it.
  let row = await read();
  for (let attempt = 0; attempt < 10 && row?.code === "owner-empty"; attempt++) {
    await page.waitForTimeout(1500);
    row = await read();
  }
  if (!row) {
    console.log(`${target.id}: no diagnostic`);
    continue;
  }
  const n = row.normal;
  const tilt = n ? (Math.acos(Math.min(1, Math.max(-1, n.y))) * 180) / Math.PI : null;
  console.log(`\n${target.id} (unit ${target.unit}, owner ${row.owner})`);
  console.log(`  code            ${row.code}`);
  const routeDescribed = row.routeBlockedBy
    ? await page.evaluate(
        ([u, id]) => window.__stacksInsects.describeBox(u, id),
        [target.unit, row.routeBlockedBy],
      )
    : null;
  if (row.routeBlockedBy)
    console.log(
      `  route blocker   ${row.routeBlockedBy}\n                  owner=${routeDescribed?.ownedBy ?? "(unowned)"} size=[${(routeDescribed?.bounds ? routeDescribed.bounds.max.map((v, i) => (v - routeDescribed.bounds.min[i]).toFixed(3)) : []).join(", ")}]`,
    );
  const described = row.blockedBy
    ? await page.evaluate(
        ([u, id]) => window.__stacksInsects.describeBox(u, id),
        [target.unit, row.blockedBy],
      )
    : null;
  console.log(`  blocked by      ${row.blockedBy ?? "(nothing)"}`);
  if (described) {
    console.log(`  blocker owner   ${described.ownedBy ?? "(unowned)"}`);
    const m = described.material;
    console.log(
      `  blocker material ${m ? `${m.type} name="${m.name}" transparent=${m.transparent} opacity=${m.opacity} depthWrite=${m.depthWrite}` : "(none)"}`,
    );
    if (described.bounds && row.worldContact) {
      const { min, max } = described.bounds;
      const size = max.map((v, i) => (v - min[i]).toFixed(4));
      const c = row.worldContact;
      // Signed distance from the contact to the blocker box: negative means the
      // contact is inside it, which is the case support grouping already
      // forgives.
      const outside = [
        Math.max(min[0] - c.x, 0, c.x - max[0]),
        Math.max(min[1] - c.y, 0, c.y - max[1]),
        Math.max(min[2] - c.z, 0, c.z - max[2]),
      ];
      console.log(`  blocker size    [${size.join(", ")}] m`);
      console.log(
        `  contact→blocker ${Math.hypot(...outside).toFixed(4)} m (0 = contact is inside it)`,
      );
    }
  }
  console.log(
    `  resolved normal ${n ? `[${n.x.toFixed(4)}, ${n.y.toFixed(4)}, ${n.z.toFixed(4)}]  tilt ${tilt.toFixed(1)}° from vertical` : "null"}`,
  );
  console.log(
    `  contact (local) ${row.localContact ? `[${row.localContact.x.toFixed(4)}, ${row.localContact.y.toFixed(4)}, ${row.localContact.z.toFixed(4)}]` : "null"}`,
  );
  console.log(
    `  authored (local)${row.authored ? `[${row.authored.x.toFixed(4)}, ${row.authored.y.toFixed(4)}, ${row.authored.z.toFixed(4)}]` : "null"}`,
  );
}
await browser.close();
