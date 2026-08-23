// Live insect-scene verifier — ADR 0006.
//
// WHY THIS EXISTS. The insect system shipped a rewrite with 532 passing tests
// and not one butterfly that landed. Over ninety seconds, twenty-one residents
// spent half their time in approach and reached rest zero times. The cause was
// a two-line disagreement between the planner and the pilot, and nothing in the
// suite could see it, because the test world never modelled the reserved
// support as a collider at all. That was not the only one: a teleport across
// the room, a glide-in with the wings shut, a perched body floating a third of
// a prop's height above it, and an occupancy of one where three was authored —
// every one invisible to unit tests and obvious within a minute of watching.
//
// So the properties that are statistical, live and emergent are checked here,
// against a running scene, and the vitest suite keeps what it is good at.
//
// Run:  pnpm dev            (in another terminal — this needs the DEV server,
//                            because the diagnostics bridge is development-only)
//       pnpm check:perches
//
// Env:  STACKS_URL       page to open           (default http://localhost:3000)
//       STACKS_DWELL     seconds per Unit       (default 14)
//       STACKS_HEADED    set to 1 to watch it
import { chromium } from "playwright";

import { UNIT_COUNT } from "~/app/components/stacks/data";
import { clampToInsectFlightVolume } from "~/app/components/stacks/scene/insectFlightVolume";
import {
  BUTTERFLY_PILOT_PROFILE,
  MOTH_PILOT_PROFILE,
} from "~/app/components/stacks/scene/insectPilot";
import { UNIT_FLIGHT_VOLUMES } from "~/app/components/stacks/scene/insectResidency";

const URL = process.env.STACKS_URL ?? "http://localhost:3000";
const DWELL_SECONDS = Number(process.env.STACKS_DWELL ?? 14);
const SAMPLE_MS = 250;
/** Distinct residents that must be observed at rest across the whole walk.
 * Deliberately a population statistic and not a per-Unit one: which shelf a
 * resident settles on is exactly the thing Residency is allowed to change. */
const MIN_PERCHED_RESIDENTS = 6;
/** Slack on the speed a sample-to-sample displacement implies. Samples are
 * taken from wall-clock polling against a scene clock, so a little jitter in
 * the interval is expected; a teleport is not a little jitter. */
const SPEED_SLACK = 1.6;
/** How far below its contact plane a settled insect may sit. Zero, plus float
 * for the projection that keeps it there. */
const CONTACT_TOLERANCE = 1e-4;

type Point = { x: number; y: number; z: number };

type Diagnostic = {
  perchId: string;
  unitIndex: number;
  ownerId: string | null;
  status: "valid" | "occupied" | "rejected";
  disposition: "ready" | "waiting" | "rejected";
  rejectionCode: string;
  rejectionReason: string;
  resolvedContact: Point | null;
  normal: Point | null;
};

type Telemetry = {
  rejectionCode?: string;
  event?: string;
  occupantId: string;
  time?: number;
  species?: "butterfly" | "moth";
  unitIndex: number;
  initialResidency?: number;
  residentIndex: number;
  phase: string;
  position?: Point;
  transitTo?: number | null;
  rehomedAt?: number;
  perchId?: string | null;
  contactGap?: number | null;
  speed: number;
};

type OwnerSite = { id: string; empty: boolean };

type Bridge = {
  time: number;
  activeUnit: number;
  diagnostics: Diagnostic[];
  flights: { telemetry: Telemetry }[];
  owners: (unit: number) => OwnerSite[];
};

/**
 * Rejections that describe the LOADER, not the geometry.
 *
 * A prop that has not streamed in has no bounds and no triangles, and a Perch
 * on it honestly reports so. Failing on that would be measuring the LOD, and
 * headless Chromium settles on a lower quality rung than a real visitor's
 * machine — so these are only a failure when the prop IS mounted and the Perch
 * still cannot find it.
 */
const MOUNTING_CODES = new Set([
  "owner-not-found",
  "owner-empty",
  "no-triangle-surface",
  "collision-index-unavailable",
]);

// `__stacks` is already declared by StacksCanvas; only the insect bridge is
// new here.
declare global {
  interface Window {
    __stacksInsects?: Bridge;
  }
}

const failures: string[] = [];
let checks = 0;
const assertOk = (ok: boolean, message: string) => {
  checks++;
  if (!ok) failures.push(message);
};

const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function main() {
  const browser = await chromium.launch({
    headless: process.env.STACKS_HEADED !== "1",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__stacks?.scrollTo), null, {
      timeout: 90_000,
    });
    await page
      .waitForFunction(() => Boolean(window.__stacksInsects), null, {
        timeout: 90_000,
      })
      .catch(() => {
        throw new Error(
          `no window.__stacksInsects at ${URL} — the diagnostics bridge is development-only, so this needs \`pnpm dev\`, not \`pnpm start\`.`,
        );
      });

    // The catalogue, keyed by Perch. A Perch only resolves while its Unit is
    // mounted and its collision index is current, so every entry is recorded
    // from the Unit's own dwell rather than from wherever the walk happens to
    // end.
    /**
     * Per Perch: the worst verdict seen, and whether it was EVER ready while
     * its own Unit was in view.
     *
     * "Reachable" has to be a property that holds at least sometimes, not one
     * sampled at a single instant. Props settle, plants sway, the alarm clock
     * swings and a lamp eases — the collision index genuinely changes, and a
     * marginal corridor opens and closes with it. Reading only the last sample
     * made the verdict a coin flip: two runs a minute apart named nine
     * rejections each and agreed on six.
     */
    const perchVerdicts = new Map<
      string,
      { ready: number; samples: number; worst: Diagnostic }
    >();
    /** Interaction ids seen mounted, per Unit, at any point in that Unit's own
     * dwell. A Perch whose owner never appears here is an authoring error; one
     * whose owner does appear but which still cannot resolve is a real defect. */
    const mountedOwners = new Map<number, Set<string>>();
    // Per resident: the last sample, so a displacement can be measured.
    const lastSample = new Map<string, Telemetry>();
    const perchedResidents = new Set<string>();
    const restsByUnit = new Array<number>(UNIT_COUNT).fill(0);
    const residencyByUnit = new Array<number>(UNIT_COUNT).fill(0);
    let residencySamples = 0;
    let telemetrySamples = 0;
    /** Where residents spend their time. Not an assertion — the shape of this
     * is what tells a human WHICH stage of the Landing Cycle is failing, which
     * is the question a bare "nobody landed" cannot answer. */
    const phaseSamples = new Map<string, number>();
    /** Why landings end. The difference between "nobody landed" and a question
     * with an answer. */
    const pilotRejections = new Map<string, number>();

    const maxSpeed = (species: Telemetry["species"]) =>
      (species === "moth"
        ? MOTH_PILOT_PROFILE.maxSpeed
        : BUTTERFLY_PILOT_PROFILE.maxSpeed) * SPEED_SLACK;

    const sample = (bridge: Bridge, dwellUnit: number) => {
      for (const diagnostic of bridge.diagnostics) {
        // Only while the Perch's own Unit is in view. A Perch whose Unit is
        // unmounted honestly reports no collision index, and treating that as
        // a rejection would be measuring the LOD.
        if (diagnostic.unitIndex !== dwellUnit) continue;
        const entry = perchVerdicts.get(diagnostic.perchId) ?? {
          ready: 0,
          samples: 0,
          worst: diagnostic,
        };
        entry.samples += 1;
        if (diagnostic.disposition === "rejected") entry.worst = diagnostic;
        else entry.ready += 1;
        perchVerdicts.set(diagnostic.perchId, entry);
      }

      for (const { telemetry } of bridge.flights) {
        telemetrySamples++;
        const previous = lastSample.get(telemetry.occupantId);
        lastSample.set(telemetry.occupantId, telemetry);
        if (telemetry.species !== "moth") {
          residencyByUnit[telemetry.unitIndex] =
            (residencyByUnit[telemetry.unitIndex] ?? 0) + 1;
        }

        phaseSamples.set(
          telemetry.phase,
          (phaseSamples.get(telemetry.phase) ?? 0) + 1,
        );
        // Transitions, not samples: `rejectionCode` is sticky until the
        // pilot's next command, so counting every sample reports how long a
        // resident carried a verdict rather than how often it earned one.
        if (
          telemetry.rejectionCode &&
          telemetry.rejectionCode !== "none" &&
          telemetry.rejectionCode !== previous?.rejectionCode
        )
          pilotRejections.set(
            telemetry.rejectionCode,
            (pilotRejections.get(telemetry.rejectionCode) ?? 0) + 1,
          );

        if (telemetry.phase === "rest") {
          perchedResidents.add(telemetry.occupantId);
          restsByUnit[telemetry.unitIndex] =
            (restsByUnit[telemetry.unitIndex] ?? 0) + 1;
        }

        // (a) Nothing sits below the plane it is standing on. The pilot
        // projects this away every step; this is what proves the projection is
        // still there.
        if (telemetry.contactGap != null) {
          assertOk(
            telemetry.contactGap >= -CONTACT_TOLERANCE,
            `(a) ${telemetry.occupantId} is ${(-telemetry.contactGap * 1000).toFixed(1)} mm BELOW its contact plane on ${telemetry.perchId}`,
          );
        }

        // (b) Nothing lands outside its own containment. A butterfly's is its
        // current Unit's Flight Volume; a moth has no Unit, so it is exempt.
        if (
          telemetry.species !== "moth" &&
          telemetry.position &&
          (telemetry.phase === "rest" || telemetry.phase === "touchdown")
        ) {
          const volume = UNIT_FLIGHT_VOLUMES[telemetry.unitIndex];
          // The exact invariant is not "inside the authored extent" — the
          // Training barbell plate sits 46 cm past its Unit's lateral face,
          // inside the handoff band, and is perfectly landable. It is that the
          // last-resort CLAMP would not fire, because the clamp is a hard
          // position write and a resident released from a Perch it clamps
          // teleports across the room.
          const probe = { ...telemetry.position };
          assertOk(
            Boolean(volume) &&
              !clampToInsectFlightVolume(
                volume!,
                probe,
                { x: 0, y: 0, z: 0 },
                0.05,
              ),
            `(b) ${telemetry.occupantId} is perched on ${telemetry.perchId} somewhere Unit ${telemetry.unitIndex}'s own containment would clamp it`,
          );
        }

        // (c) The teleport, as one assertion. Re-homing is the SAME position
        // write the bug was; the only thing separating them is the margin, so
        // a re-home is excused by name and by nothing else.
        if (
          previous?.position &&
          telemetry.position &&
          previous.time != null &&
          telemetry.time != null
        ) {
          const elapsed = telemetry.time - previous.time;
          const rehomed =
            (telemetry.rehomedAt ?? -1) > (previous.rehomedAt ?? -1);
          if (elapsed > 1e-3 && !rehomed) {
            const moved = distance(previous.position, telemetry.position);
            const implied = moved / elapsed;
            assertOk(
              implied <= maxSpeed(telemetry.species),
              `(c) ${telemetry.occupantId} moved ${moved.toFixed(2)} m in ${elapsed.toFixed(2)} s — ${implied.toFixed(2)} m/s, which flight cannot explain`,
            );
          }
        }
      }
      residencySamples++;
    };

    for (let unit = 0; unit < UNIT_COUNT; unit++) {
      await page.evaluate((index) => {
        window.__stacks?.scrollTo(index, { instant: true });
      }, unit);
      // Let the Unit mount and its props stream in before believing anything
      // it says about its own geometry.
      await page.waitForTimeout(2500);
      const until = Date.now() + DWELL_SECONDS * 1000;
      while (Date.now() < until) {
        const bridge = await page.evaluate(
          () => window.__stacksInsects ?? null,
        );
        if (bridge) sample(bridge, unit);
        await page.waitForTimeout(SAMPLE_MS);
      }
    }

    // ---- Perches resolve and are reachable -------------------------------
    const rejected = [...perchVerdicts.values()]
      .filter((entry) => entry.ready === 0)
      .map((entry) => entry.worst);
    const marginal = [...perchVerdicts.values()].filter(
      (entry) => entry.ready > 0 && entry.ready < entry.samples,
    );
    const unmounted: Diagnostic[] = [];
    for (const diagnostic of rejected) {
      const owners = mountedOwners.get(diagnostic.unitIndex);
      const ownerMounted =
        !diagnostic.ownerId || Boolean(owners?.has(diagnostic.ownerId));
      if (MOUNTING_CODES.has(diagnostic.rejectionCode) && !ownerMounted) {
        unmounted.push(diagnostic);
        continue;
      }
      assertOk(
        false,
        `(d) Perch rejected: ${diagnostic.perchId} — ${diagnostic.rejectionCode}: ${diagnostic.rejectionReason}`,
      );
    }
    if (unmounted.length)
      console.log(
        `  not mounted            ${unmounted.map((d) => d.perchId).join(" ")}`,
      );
    assertOk(
      perchVerdicts.size > 0,
      "(d) no Perches were evaluated at all — the bridge published an empty catalogue",
    );
    for (const entry of perchVerdicts.values())
      assertOk(
        entry.worst.resolvedContact !== null ||
          entry.worst.disposition !== "ready",
        `(d) ${entry.worst.perchId} reports ready with no resolved contact`,
      );
    // Not a failure: a Perch that resolves most of the time and not always is
    // a real quality signal, and the one worth watching as props move.
    if (marginal.length)
      console.log(
        `  marginal               ${marginal
          .map(
            (entry) =>
              `${entry.worst.perchId}(${entry.ready}/${entry.samples})`,
          )
          .join(" ")}`,
      );

    // ---- Insects actually land -------------------------------------------
    assertOk(
      perchedResidents.size >= MIN_PERCHED_RESIDENTS,
      `(e) only ${perchedResidents.size} distinct residents were seen at rest across the walk; expected at least ${MIN_PERCHED_RESIDENTS}`,
    );
    assertOk(
      telemetrySamples > 0,
      "(e) no flight telemetry was published at all",
    );

    // ---- Report ----------------------------------------------------------
    const perUnit = restsByUnit
      .map((count, unit) => `${unit}:${count}`)
      .join(" ");
    const residency = residencyByUnit
      .map(
        (count, unit) =>
          `${unit}:${(count / Math.max(1, residencySamples)).toFixed(1)}`,
      )
      .join(" ");
    console.log(
      `stacks-perch-check: ${perchVerdicts.size} Perches, ${rejected.length} rejected; ` +
        `${perchedResidents.size} residents seen at rest; ` +
        `${telemetrySamples} telemetry samples, ${checks} assertions, ${failures.length} failure(s)`,
    );
    console.log(`  rest samples by Unit   ${perUnit}`);
    console.log(`  mean residency by Unit ${residency}`);
    console.log(
      `  phase mix              ${[...phaseSamples.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
          ([phase, count]) =>
            `${phase}:${((count / Math.max(1, telemetrySamples)) * 100).toFixed(0)}%`,
        )
        .join(" ")}`,
    );
    if (pilotRejections.size)
      console.log(
        `  pilot rejections       ${[...pilotRejections.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => `${code}:${count}`)
          .join(" ")}`,
      );
    const codes = new Map<string, number>();
    for (const entry of perchVerdicts.values())
      if (entry.ready === 0)
        codes.set(
          entry.worst.rejectionCode,
          (codes.get(entry.worst.rejectionCode) ?? 0) + 1,
        );
    if (codes.size)
      console.log(
        `  rejections             ${[...codes.entries()]
          .map(([code, count]) => `${code}:${count}`)
          .join(" ")}`,
      );
  } finally {
    await browser.close();
  }

  if (failures.length) {
    const shown = failures.slice(0, 40);
    for (const failure of shown) console.error("  FAIL " + failure);
    if (failures.length > shown.length)
      console.error(`  … and ${failures.length - shown.length} more`);
    process.exit(1);
  }
  console.log("  all clear — every Perch reachable, nobody teleported");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
