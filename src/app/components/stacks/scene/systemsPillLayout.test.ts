import { describe, expect, it } from "vitest";

import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  PILL_BOTTLES,
  PILL_CASE_LID_H,
  PILL_BOTTLE_SIZES,
  PILL_ORGANIZER,
  PILL_ORGANIZER_ROW,
  pillBottleHeight,
} from "./systemsPillLayout";

/** The supplements print's IMAGE, from its authored width in `UnitSystems`
 * (0.44 at x 0.58). Tall props inside this span hide the picture whatever
 * their z, because the scene camera sits about two degrees above the shelf
 * line. The frame's 0.024 border either side is deliberately not protected:
 * a bottle clipping the outer edge of a frame is what a full shelf looks
 * like, and reserving it costs more room than it is worth. */
const PRINT_SPAN = { min: 0.36, max: 0.8 };
/** No bottle may stand in front of the print. */
const SHORT_ENOUGH_FOR_THE_PRINT = 0.1;
/** A case pair may: two real cases stack to 0.128, and the print stands
 * 0.268 tall, so its upper half still reads over them. */
const SHORT_ENOUGH_FOR_A_CASE = 0.14;

/** The four corners of a case's footprint, in world x/z. */
const caseCorners = (organizer: (typeof PILL_ORGANIZER_ROW)[number]) => {
  const halfLength = PILL_ORGANIZER.length / 2;
  const halfDepth = PILL_ORGANIZER.depth / 2;
  const cos = Math.cos(organizer.yaw);
  const sin = Math.sin(organizer.yaw);
  return [
    [halfLength, halfDepth],
    [halfLength, -halfDepth],
    [-halfLength, -halfDepth],
    [-halfLength, halfDepth],
  ].map(([localX, localZ]) => ({
    x: organizer.x + localX! * cos + localZ! * sin,
    z: organizer.z - localX! * sin + localZ! * cos,
  }));
};

/**
 * Whether two case footprints overlap, by the separating-axis test.
 *
 * An x-span comparison is not enough once the pairs sit at different depths:
 * these two stacks deliberately overlap in x by more than a third of their
 * length and are held apart in z instead, which an axis-aligned check reads
 * as a collision.
 */
const caseFootprintsOverlap = (
  a: (typeof PILL_ORGANIZER_ROW)[number],
  b: (typeof PILL_ORGANIZER_ROW)[number],
) => {
  const cornersA = caseCorners(a);
  const cornersB = caseCorners(b);
  for (const organizer of [a, b]) {
    for (const axis of [
      { x: Math.cos(organizer.yaw), z: -Math.sin(organizer.yaw) },
      { x: Math.sin(organizer.yaw), z: Math.cos(organizer.yaw) },
    ]) {
      const project = (corners: typeof cornersA) =>
        corners.map((corner) => corner.x * axis.x + corner.z * axis.z);
      const spanA = project(cornersA);
      const spanB = project(cornersB);
      if (
        Math.max(...spanA) <= Math.min(...spanB) ||
        Math.max(...spanB) <= Math.min(...spanA)
      )
        return false;
    }
  }
  return true;
};

const radiusOf = (size: keyof typeof PILL_BOTTLE_SIZES) =>
  PILL_BOTTLE_SIZES[size].radius;

describe("Systems pill layout", () => {
  it("stands fifteen bottles, a couple of them stacked", () => {
    expect(PILL_BOTTLES).toHaveLength(15);
    // Fewer perched than before on purpose: at the cases' real length the
    // bottles lost the right of the bay and had to spread sideways, and a
    // wide field of piles reads as clutter where a few do not.
    expect(PILL_BOTTLES.filter((bottle) => bottle.level > 0).length).toBe(2);
  });

  it("seats every stacked bottle on the cap below rather than a literal", () => {
    for (const bottle of PILL_BOTTLES) {
      const below = PILL_BOTTLES.filter(
        (other) =>
          other.x === bottle.x &&
          other.z === bottle.z &&
          other.level < bottle.level,
      );
      const expected = below.reduce(
        (total, other) => total + pillBottleHeight(other.size),
        0,
      );
      expect(bottle.y).toBeCloseTo(expected, 10);
    }
    // Same rule for the case on top of the other case.
    expect(PILL_ORGANIZER_ROW[1]?.y).toBeCloseTo(PILL_ORGANIZER.height, 10);
  });

  it("packs the piles without any two bottles intersecting", () => {
    const columns = PILL_BOTTLES.filter((bottle) => bottle.level === 0);
    for (const a of columns) {
      for (const b of columns) {
        if (a === b) continue;
        // Compare the widest bottle in each pile, not the ground one: a small
        // bottle can sit under a wider one and the overlap would be up top.
        const widest = (column: typeof a) =>
          Math.max(
            ...PILL_BOTTLES.filter(
              (other) => other.x === column.x && other.z === column.z,
            ).map((other) => radiusOf(other.size)),
          );
        const gap = Math.hypot(a.x - b.x, a.z - b.z);
        expect(gap).toBeGreaterThan(widest(a) + widest(b));
      }
    }
  });

  it("keeps every bottle on the lower plank", () => {
    const { lower } = SHELF_GEOMETRY;
    const front = lower.centerZ + lower.depth / 2;
    const back = lower.centerZ - lower.depth / 2;
    for (const bottle of PILL_BOTTLES) {
      const radius = radiusOf(bottle.size);
      expect(bottle.z + radius).toBeLessThan(front);
      expect(bottle.z - radius).toBeGreaterThan(back);
      expect(Math.abs(bottle.x) + radius).toBeLessThan(
        SHELF_GEOMETRY.width / 2,
      );
    }
  });

  it("leaves the print clear of everything tall", () => {
    for (const bottle of PILL_BOTTLES) {
      const radius = radiusOf(bottle.size);
      const overlapsPrint =
        bottle.x + radius > PRINT_SPAN.min && bottle.x - radius < PRINT_SPAN.max;
      if (!overlapsPrint) continue;
      expect(bottle.y + pillBottleHeight(bottle.size)).toBeLessThan(
        SHORT_ENOUGH_FOR_THE_PRINT,
      );
    }
    // Per case, not the whole row: these are two pairs, so summing the row
    // would measure a four-high tower that is not on the shelf.
    for (const organizer of PILL_ORGANIZER_ROW) {
      expect(organizer.y + PILL_ORGANIZER.height).toBeLessThan(
        SHORT_ENOUGH_FOR_A_CASE,
      );
    }
  });

  it("clears the bottles around both cases", () => {
    for (const organizer of PILL_ORGANIZER_ROW) {
      const halfLength = PILL_ORGANIZER.length / 2;
      const halfDepth = PILL_ORGANIZER.depth / 2;
      const cos = Math.cos(organizer.yaw);
      const sin = Math.sin(organizer.yaw);
      for (const bottle of PILL_BOTTLES) {
        // Only bottles tall enough to reach this case can foul it — the top
        // case rides a whole case-height off the plank.
        const top = bottle.y + pillBottleHeight(bottle.size);
        if (top <= organizer.y) continue;
        // The bottle's centre in the case's own frame, then clamped onto the
        // case's rectangle: the shortest distance from centre to box.
        const dx = bottle.x - organizer.x;
        const dz = bottle.z - organizer.z;
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        const nearestX = Math.min(halfLength, Math.max(-halfLength, localX));
        const nearestZ = Math.min(halfDepth, Math.max(-halfDepth, localZ));
        const gap = Math.hypot(localX - nearestX, localZ - nearestZ);
        expect(gap).toBeGreaterThan(radiusOf(bottle.size));
      }
    }
  });

  it("gives all four cases and every bottle their own identity", () => {
    // Every one of these becomes a hoverKey, and two props sharing one are
    // one prop: hovering either lights both, and only the elected carrier
    // can be picked up. The cases were keyed by `variant` when there was one
    // of each colour, and stayed that way when a second pair arrived.
    const caseIds = PILL_ORGANIZER_ROW.map((organizer) => organizer.id);
    expect(new Set(caseIds).size).toBe(caseIds.length);
    expect(caseIds.every((id) => id.length > 0)).toBe(true);

    const bottleKeys = PILL_BOTTLES.map((bottle) => bottle.key);
    expect(new Set(bottleKeys).size).toBe(bottleKeys.length);

    // And no case id can collide with a bottle key, since both are namespaced
    // under grab:pills: on the same unit.
    expect(new Set([...caseIds, ...bottleKeys]).size).toBe(
      caseIds.length + bottleKeys.length,
    );
  });

  it("stands two cases of each colour", () => {
    const byVariant = PILL_ORGANIZER_ROW.reduce<Record<string, number>>(
      (counts, organizer) => ({
        ...counts,
        [organizer.variant]: (counts[organizer.variant] ?? 0) + 1,
      }),
      {},
    );
    expect(byVariant).toEqual({ white: 2, smoke: 2 });
  });

  it("gives every stacked case an exposed end to show its own lettering", () => {
    const bottoms = PILL_ORGANIZER_ROW.filter((organizer) => organizer.y === 0);
    const tops = PILL_ORGANIZER_ROW.filter((organizer) => organizer.y > 0);
    expect(tops).toHaveLength(bottoms.length);
    for (const top of tops) {
      // The case this one stands on: nearest in BOTH axes. Nearest-in-x alone
      // picks the other pair's bottom case, because the pairs overlap in x
      // and are separated in depth.
      const distance = (organizer: (typeof PILL_ORGANIZER_ROW)[number]) =>
        Math.hypot(organizer.x - top.x, organizer.z - top.z);
      const carrier = bottoms.reduce((nearest, candidate) =>
        distance(candidate) < distance(nearest) ? candidate : nearest,
      );
      expect(carrier.variant).not.toBe(top.variant);
      expect(top.y).toBeCloseTo(PILL_ORGANIZER.height, 10);
      // Squarely stacked, the top case hides every lid on the one below it.
      const offset = Math.abs(top.x - carrier.x);
      expect(offset).toBeGreaterThan(PILL_ORGANIZER.length * 0.15);
      expect(offset).toBeLessThan(PILL_ORGANIZER.length * 0.5);
    }
  });

  it("keeps the two pairs from running into each other", () => {
    for (const a of PILL_ORGANIZER_ROW) {
      for (const b of PILL_ORGANIZER_ROW) {
        if (a === b || a.y !== b.y) continue;
        expect(caseFootprintsOverlap(a, b)).toBe(false);
      }
    }
  });

  it("leaves each pair an end sticking out past the other", () => {
    const [backBottom, , frontBottom] = PILL_ORGANIZER_ROW;
    expect(backBottom && frontBottom).toBeTruthy();
    if (!backBottom || !frontBottom) return;
    // Where the pairs overlap in x the front one hides the back one, so the
    // overhang either side is all that says there are two.
    const overhang = Math.abs(frontBottom.x - backBottom.x);
    expect(overhang).toBeGreaterThan(PILL_ORGANIZER.length * 0.15);
  });

  it("matches the real case, 8.86 x 1.34 x 1.26 inches", () => {
    const inch = 0.0254 * 2; // world units per inch, at 2.00 per metre
    expect(PILL_ORGANIZER.length).toBeCloseTo(8.86 * inch, 6);
    expect(PILL_ORGANIZER.depth).toBeCloseTo(1.34 * inch, 6);
    expect(PILL_ORGANIZER.height).toBeCloseTo(1.26 * inch, 6);
    // Long and low: seven times its own height, which is what stops it
    // reading as a box, and a lid that is a wafer rather than a storey.
    expect(PILL_ORGANIZER.length / PILL_ORGANIZER.height).toBeGreaterThan(6.5);
    expect(PILL_CASE_LID_H / PILL_ORGANIZER.height).toBeLessThan(0.2);
  });
});
