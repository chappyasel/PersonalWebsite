import { describe, expect, it } from "vitest";

import {
  type CollisionPoint,
  INSECT_ENVELOPES,
  type InsectCollisionBox,
  insectCollisionRevisionIsCurrent,
  insectCorridorIsClear,
  insectFoldedCorridorIsClear,
  insectTerminalPoseIsClear,
  reviseInsectCollisionIndex,
  sweptSphereIntersectsBox,
} from "./insectCollision";

const point = (x: number, y: number, z: number): CollisionPoint => ({
  x,
  y,
  z,
});

const box = (
  id: string,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): InsectCollisionBox => ({
  id,
  min: point(...min),
  max: point(...max),
});

const contact = point(0, 0.1, 0);
const up = point(0, 1, 0);
const across = point(1, 0, 0);
const wideSupport = box("support", [-0.2, 0, -0.2], [0.2, 0.1, 0.2]);

describe("insect collision kernel", () => {
  it("keeps species-specific fully extended envelopes conservative", () => {
    expect(INSECT_ENVELOPES.butterfly.halfSpan).toBeGreaterThanOrEqual(0.057);
    expect(INSECT_ENVELOPES.butterfly.halfLength).toBeGreaterThanOrEqual(0.046);
    expect(INSECT_ENVELOPES.moth.halfSpan).toBeGreaterThan(
      INSECT_ENVELOPES.butterfly.halfSpan,
    );
    for (const envelope of Object.values(INSECT_ENVELOPES)) {
      expect(envelope.sweepRadius).toBeGreaterThanOrEqual(
        Math.hypot(envelope.halfSpan, envelope.halfLength, envelope.halfHeight),
      );
    }
  });

  it("rejects a terminal pose that clips an adjacent sibling", () => {
    const sibling = box("sibling", [0.035, 0.04, -0.08], [0.075, 0.16, 0.08]);
    const index = reviseInsectCollisionIndex(null, [wideSupport, sibling]);

    expect(
      insectTerminalPoseIsClear(
        contact,
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        index,
        new Set([wideSupport.id]),
      ),
    ).toBe(false);
  });

  it("accepts a folded touchdown onto a narrow top edge without ignoring its face", () => {
    const edge = box("frame-edge", [-0.2, 0, -0.02], [0.2, 0.1, 0.02]);
    const portraitFace = box(
      "portrait-face",
      [-0.18, -0.2, 0.017],
      [0.18, 0.07, 0.022],
    );
    const index = reviseInsectCollisionIndex(null, [edge, portraitFace]);
    const touchdown = [point(0, 0.3, 0), point(0, 0.122, 0)];
    const contactRegion = { center: contact, radius: 0.128 };

    // The old spherical terminal sweep sees the face below the edge even
    // though the folded wings and body remain completely above it.
    expect(
      insectCorridorIsClear(
        touchdown,
        INSECT_ENVELOPES.butterfly.sweepRadius,
        index,
        new Set([edge.id]),
        false,
        contactRegion,
      ),
    ).toBe(false);
    expect(
      insectFoldedCorridorIsClear(
        touchdown,
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        index,
        new Set([edge.id]),
        contactRegion,
      ),
    ).toBe(true);
  });

  it.each([
    {
      name: "portrait frame",
      support: box("frame-edge", [-0.2, 0, -0.02], [0.2, 0.1, 0.02]),
      sibling: box("portrait-face", [-0.18, -0.2, 0.017], [0.18, 0.07, 0.022]),
      tangent: across,
    },
    {
      name: "upright book",
      support: box("book-spine", [-0.03, 0, -0.15], [0.03, 0.1, 0.15]),
      sibling: box("next-book", [0.04, 0, -0.15], [0.1, 0.07, 0.15]),
      tangent: point(0, 0, 1),
    },
  ])(
    "completes a folded lift before opening above a narrow $name top",
    ({ support, sibling, tangent }) => {
      const index = reviseInsectCollisionIndex(null, [support, sibling]);
      const rootAtContact = point(0, 0.122, 0);
      const unfold = point(0, 0.259, 0);
      const launchTarget = point(0.18, 0.4, 0);
      const contactRegion = { center: contact, radius: 0.128 };

      // Opening at contact is the historical false rejection: the flying
      // sphere intersects the object even though a folded insect can rise.
      expect(
        insectCorridorIsClear(
          [rootAtContact, launchTarget],
          INSECT_ENVELOPES.butterfly.sweepRadius,
          index,
          new Set([support.id]),
          false,
          contactRegion,
        ),
      ).toBe(false);
      expect(
        insectFoldedCorridorIsClear(
          [rootAtContact, unfold],
          up,
          tangent,
          INSECT_ENVELOPES.butterfly,
          index,
          new Set([support.id]),
          contactRegion,
        ),
      ).toBe(true);
      expect(
        insectCorridorIsClear(
          [unfold, launchTarget],
          INSECT_ENVELOPES.butterfly.sweepRadius,
          index,
          new Set([support.id]),
          false,
          contactRegion,
        ),
      ).toBe(true);
    },
  );

  it("clears a lateral neighbor that only an incorrectly spread wing hits", () => {
    const bodyHeading = point(0, 0, 1);
    const wingtipNeighbor = box(
      "wingtip-neighbor",
      [0.045, 0.105, -0.015],
      [0.075, 0.145, 0.015],
    );
    const index = reviseInsectCollisionIndex(null, [
      wideSupport,
      wingtipNeighbor,
    ]);
    expect(
      insectTerminalPoseIsClear(
        contact,
        up,
        bodyHeading,
        INSECT_ENVELOPES.butterfly,
        index,
        new Set([wideSupport.id]),
      ),
    ).toBe(true);
  });

  it("still rejects geometry intersecting the complete folded pose", () => {
    const bodyHeading = point(1, 0, 0);
    const foldedWingNeighbor = box(
      "folded-wing-neighbor",
      [-0.03, 0.12, 0.01],
      [0.03, 0.18, 0.03],
    );
    const index = reviseInsectCollisionIndex(null, [
      wideSupport,
      foldedWingNeighbor,
    ]);
    expect(
      insectTerminalPoseIsClear(
        contact,
        up,
        bodyHeading,
        INSECT_ENVELOPES.butterfly,
        index,
        new Set([wideSupport.id]),
      ),
    ).toBe(false);
  });

  it("catches a midpoint-only barrier even when both endpoints are clear", () => {
    const barrier = box("barrier", [-0.03, 0.2, -0.03], [0.03, 0.3, 0.03]);
    const start = point(-0.5, 0.25, 0);
    const end = point(0.5, 0.25, 0);

    expect(sweptSphereIntersectsBox(start, start, 0.05, barrier)).toBe(false);
    expect(sweptSphereIntersectsBox(end, end, 0.05, barrier)).toBe(false);
    expect(sweptSphereIntersectsBox(start, end, 0.05, barrier)).toBe(true);
  });

  it("rejects a multi-segment departure when its rejoin leg is blocked", () => {
    const departureBarrier = box(
      "departure-barrier",
      [0.38, 0.32, -0.08],
      [0.46, 0.48, 0.08],
    );
    const index = reviseInsectCollisionIndex(null, [departureBarrier]);
    const departure = [
      point(0, 0.12, 0),
      point(0, 0.42, 0),
      point(0.8, 0.42, 0),
    ];

    expect(
      insectCorridorIsClear(
        departure,
        INSECT_ENVELOPES.butterfly.sweepRadius,
        index,
      ),
    ).toBe(false);
  });

  it("invalidates a captured plan revision before a moved sibling clips it", () => {
    const farSibling = box("sibling", [1, 0.04, -0.08], [1.04, 0.16, 0.08]);
    const initial = reviseInsectCollisionIndex(null, [wideSupport, farSibling]);
    const plannedRevision = initial.revision;
    expect(
      insectTerminalPoseIsClear(
        contact,
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        initial,
        new Set([wideSupport.id]),
      ),
    ).toBe(true);

    const nearSibling = box(
      "sibling",
      [0.035, 0.04, -0.08],
      [0.075, 0.16, 0.08],
    );
    const moved = reviseInsectCollisionIndex(initial, [
      wideSupport,
      nearSibling,
    ]);
    expect(insectCollisionRevisionIsCurrent(moved, plannedRevision)).toBe(
      false,
    );
    expect(
      insectTerminalPoseIsClear(
        contact,
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        moved,
        new Set([wideSupport.id]),
      ),
    ).toBe(false);
  });

  it("keeps a stable revision across unchanged timed cache rebuilds", () => {
    const first = reviseInsectCollisionIndex(null, [wideSupport]);
    const unchanged = reviseInsectCollisionIndex(first, [
      box("support", [-0.2, 0, -0.2], [0.2, 0.1, 0.2]),
    ]);
    expect(unchanged).toBe(first);
    const moved = reviseInsectCollisionIndex(first, [
      box("support", [-0.2, 0, -0.2], [0.21, 0.1, 0.2]),
    ]);
    expect(moved.revision).toBe(first.revision + 1);
  });

  it("limits the support exception to a bounded contact region", () => {
    const longSupport = box("support", [-1, 0, -0.08], [1, 0.08, 0.08]);
    const index = reviseInsectCollisionIndex(null, [longSupport]);
    const region = { center: point(0, 0.08, 0), radius: 0.14 };
    expect(
      insectCorridorIsClear(
        [point(0, 0.22, 0), point(0, 0.1, 0)],
        0.04,
        index,
        new Set(["support"]),
        false,
        region,
      ),
    ).toBe(true);
    expect(
      insectCorridorIsClear(
        [point(0.75, 0.22, 0), point(0.75, 0.1, 0)],
        0.04,
        index,
        new Set(["support"]),
        false,
        region,
      ),
    ).toBe(false);

    // A tilted support's world AABB can extend above the actual triangle at
    // the contact. Only the bounded contact neighborhood is forgiven.
    const tiltedSupport = box(
      "tilted-support",
      [-1, 0, -0.08],
      [1, 0.14, 0.08],
    );
    const terminalIndex = reviseInsectCollisionIndex(null, [tiltedSupport]);
    expect(
      insectTerminalPoseIsClear(
        point(0, 0.08, 0),
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        terminalIndex,
        new Set([tiltedSupport.id]),
        region,
      ),
    ).toBe(true);
    expect(
      insectTerminalPoseIsClear(
        point(0.75, 0.08, 0),
        up,
        across,
        INSECT_ENVELOPES.butterfly,
        terminalIndex,
        new Set([tiltedSupport.id]),
        region,
      ),
    ).toBe(false);
  });

  it("permits only monotonically outward recovery from a moved collider", () => {
    const movedSibling = box("moved", [-0.1, 0, -0.1], [0.1, 0.2, 0.1]);
    const index = reviseInsectCollisionIndex(null, [movedSibling]);
    const trapped = point(0, 0.1, 0);
    const outward = point(0.03, 0.1, 0);
    const inward = point(0.01, 0.1, 0);
    const lateral = point(0.03, 0.13, 0);
    const escaped = point(0.3, 0.1, 0);
    expect(insectCorridorIsClear([trapped, outward], 0.02, index)).toBe(false);
    expect(
      insectCorridorIsClear([trapped, outward], 0.02, index, null, true),
    ).toBe(true);
    expect(
      insectCorridorIsClear([outward, inward], 0.02, index, null, true),
    ).toBe(false);
    expect(
      insectCorridorIsClear([outward, lateral], 0.02, index, null, true),
    ).toBe(false);
    expect(
      insectCorridorIsClear([outward, escaped], 0.02, index, null, true),
    ).toBe(true);
    const nearLeftFace = point(-0.11, 0.1, 0);
    expect(
      insectCorridorIsClear(
        [nearLeftFace, point(0.3, 0.1, 0)],
        0.02,
        index,
        null,
        true,
      ),
    ).toBe(false);
    expect(
      insectCorridorIsClear(
        [nearLeftFace, point(-0.3, 0.1, 0)],
        0.02,
        index,
        null,
        true,
      ),
    ).toBe(true);
  });

  it("fails closed when overlapping colliders have no shared local exit", () => {
    const overlapping = [
      box("x-left", [-0.2, -0.2, -0.2], [0.01, 0.2, 0.2]),
      box("x-right", [-0.01, -0.2, -0.2], [0.2, 0.2, 0.2]),
      box("y-low", [-0.2, -0.2, -0.2], [0.2, 0.01, 0.2]),
      box("y-high", [-0.2, -0.01, -0.2], [0.2, 0.2, 0.2]),
      box("z-back", [-0.2, -0.2, -0.2], [0.2, 0.2, 0.01]),
      box("z-front", [-0.2, -0.2, -0.01], [0.2, 0.2, 0.2]),
    ];
    const start = point(0, 0, 0);
    const exit = point(0.5, 0, 0);
    expect(
      insectCorridorIsClear(
        [start, exit],
        0.02,
        reviseInsectCollisionIndex(null, overlapping),
        null,
        true,
      ),
    ).toBe(false);
  });

  it("requires progress out of both a shelf plank and its tall neighbor", () => {
    const plank = box(
      "mesh:plank",
      [-1.32, -0.035, -0.425],
      [1.32, 0.035, 0.425],
    );
    const tallNeighbor = box(
      "mesh:tall",
      [0.06, 0.035, 0.1],
      [0.1, 0.275, 0.16],
    );
    const start = point(0, 0.1, 0.13);
    const above = point(0, 0.44, 0.13);
    expect(
      insectCorridorIsClear(
        [start, above],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        reviseInsectCollisionIndex(null, [plank, tallNeighbor]),
        null,
        true,
      ),
    ).toBe(false);
    expect(
      insectCorridorIsClear(
        [start, point(-0.06, 0.16, 0.13)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        reviseInsectCollisionIndex(null, [plank, tallNeighbor]),
        null,
        true,
      ),
    ).toBe(true);
  });

  it("uses a nearby alternate face when the nearest exit meets a new prop", () => {
    const plank = box(
      "mesh:plank",
      [-1.32, -0.035, -0.425],
      [1.32, 0.035, 0.425],
    );
    const nearestExitBlocker = box(
      "mesh:prop-a",
      [-0.2108, 0.035, 0.181],
      [-0.1128, 0.3073, 0.237],
    );
    const containingProp = box(
      "mesh:prop-b",
      [-0.0041, 0.035, 0.2625],
      [0.1285, 0.1652, 0.317],
    );
    const start = point(-0.0324, 0.1302, 0.3036);
    const index = reviseInsectCollisionIndex(null, [
      plank,
      nearestExitBlocker,
      containingProp,
    ]);
    expect(
      insectCorridorIsClear(
        [start, point(start.x - 0.06, start.y, start.z)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        index,
        null,
        true,
      ),
    ).toBe(false);
    expect(
      insectCorridorIsClear(
        [start, point(start.x, start.y + 0.3, start.z)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        index,
        null,
        true,
      ),
    ).toBe(true);

    const grazingStart = point(-0.0268, 0.22, 0.3599);
    const grazingIndex = reviseInsectCollisionIndex(null, [
      plank,
      box(
        "mesh:grazing-blocker",
        [-0.1498, 0.035, 0.1835],
        [-0.1075, 0.2634, 0.2922],
      ),
      box(
        "mesh:grazed-prop",
        [0.0532, 0.035, 0.2986],
        [0.1423, 0.2281, 0.3939],
      ),
    ]);
    expect(
      insectCorridorIsClear(
        [
          grazingStart,
          point(grazingStart.x, grazingStart.y + 0.1, grazingStart.z),
        ],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        grazingIndex,
        null,
        true,
      ),
    ).toBe(true);
  });

  it("rejects constant-depth travel through a penetrated solid", () => {
    const board = box("board", [-0.6, 0, -0.02], [0.6, 0.9, 0.02]);
    expect(
      insectCorridorIsClear(
        [point(-0.5, 0.45, 0), point(0.3, 0.45, 0)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        reviseInsectCollisionIndex(null, [board]),
        null,
        true,
      ),
    ).toBe(false);
    const slab = box("slab", [-5, -0.02, -5], [5, 0.02, 5]);
    expect(
      insectCorridorIsClear(
        [point(0, 0, 0), point(0.82, 0.001, 0)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        reviseInsectCollisionIndex(null, [slab]),
        null,
        true,
      ),
    ).toBe(false);
    expect(
      insectCorridorIsClear(
        [point(0, 0, 0), point(0.82, 0.066, 0)],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        reviseInsectCollisionIndex(null, [slab]),
        null,
        true,
      ),
    ).toBe(false);
  });

  it("does not escape one overlapping collider by moving deeper into another", () => {
    // This is the lower-shelf flight geometry that produced the visible
    // butterfly yo-yo: the wing sphere grazes the plank from above while a
    // nearby prop overlaps it from above. Moving down exits the prop, but
    // buries the butterfly farther into the shelf and toward the meadow.
    const lowerShelf = box(
      "lower-shelf",
      [-1.32, -0.8975, -0.425],
      [1.32, -0.8425, 0.425],
    );
    const overheadProp = box(
      "overhead-prop",
      [-0.2, -0.75, -0.2],
      [0.2, -0.7, 0.2],
    );
    const index = reviseInsectCollisionIndex(null, [lowerShelf, overheadProp]);
    const trapped = point(0, -0.77, 0);
    const downward = point(0, -0.81, 0);

    expect(
      insectCorridorIsClear(
        [trapped, downward],
        INSECT_ENVELOPES.butterfly.sweepRadius,
        index,
        null,
        true,
      ),
    ).toBe(false);
  });

  it("produces the same swept result at 30, 60, and 120 Hz", () => {
    // No discrete sample at any tested rate touches this offset barrier. Only
    // continuous segment checks catch it.
    const barrier = box("thin-barrier", [0.023, -0.1, -0.1], [0.027, 0.1, 0.1]);
    const index = reviseInsectCollisionIndex(null, [barrier]);

    const sampleLinearMotion = (hz: number, y: number) => {
      const samples: CollisionPoint[] = [];
      for (let frame = 0; frame <= hz; frame++) {
        samples.push(point(-1 + (2 * frame) / hz, y, 0));
      }
      return insectCorridorIsClear(samples, 0.002, index);
    };

    expect([30, 60, 120].map((hz) => sampleLinearMotion(hz, 0))).toEqual([
      false,
      false,
      false,
    ]);
    expect([30, 60, 120].map((hz) => sampleLinearMotion(hz, 0.3))).toEqual([
      true,
      true,
      true,
    ]);
  });
});
