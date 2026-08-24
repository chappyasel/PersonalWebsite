// The featured-talk gallery's physical honesty, asserted. Each of the five
// photographs resists gravity by a DIFFERENT mechanism — leaning, resting on
// furniture, cantilevered from behind, hanging in tension, gripped in a slot
// — and each claim is a solved contact in talkGalleryLayout.ts. These tests
// re-derive every contact from the shelf's own geometry, so a retuned pitch,
// border or base cannot quietly leave a print floating, intersecting its
// hardware, or hanging off a wire that does not reach.
import {
  ARTIFACT_PLANE_ASPECT_TOLERANCE,
  artifactPlaneAspectMismatch,
} from "../artifactPreviewFrames";
import {
  LOWER_SHELF_HEADROOM,
  SHELF_GEOMETRY,
  SHELF_SURFACE,
} from "../shelfGeometry";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TALK_ARM,
  TALK_BRASS,
  TALK_EASEL,
  TALK_GILT,
  TALK_GILT_DEEP,
  TALK_HANG,
  TALK_PLINTH,
  TALK_PLINTH_SLOT_Z,
  TALK_POST,
  TALK_SETUPS,
  TALK_SETUP_IDS,
  talkArmMount,
  talkBackPlaneZ,
  talkBoxCenterLocalZ,
  talkEaselLipCenterLocalZ,
  talkEaselMastTop,
  talkEaselPlaneZ,
  talkFramePoint,
  talkFramedSize,
  talkHangWires,
  talkPerchPose,
  talkPlinthHeight,
  talkSeat,
} from "./talkGalleryLayout";

const PLANK_SPAN = {
  top: {
    front: SHELF_GEOMETRY.top.centerZ + SHELF_GEOMETRY.top.depth / 2,
    back: SHELF_GEOMETRY.top.centerZ - SHELF_GEOMETRY.top.depth / 2,
  },
  lower: {
    front: SHELF_GEOMETRY.lower.centerZ + SHELF_GEOMETRY.lower.depth / 2,
    back: SHELF_GEOMETRY.lower.centerZ - SHELF_GEOMETRY.lower.depth / 2,
  },
} as const;

function corners(id: (typeof TALK_SETUP_IDS)[number]) {
  const setup = TALK_SETUPS[id];
  const framed = talkFramedSize(setup);
  const points = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        points.push(
          talkFramePoint(setup, [
            (sx * framed.width) / 2,
            (sy * framed.height) / 2,
            (sz * setup.thickness) / 2,
          ]),
        );
  return points;
}

describe("talk gallery layout", () => {
  it("feeds the solved lip and preview accents into the rendered forms", () => {
    const forms = readFileSync(
      new URL("./talkPhotoSetups.tsx", import.meta.url),
      "utf8",
    );
    expect(forms).toContain("talkEaselLipCenterLocalZ(),");
    expect(forms).toContain("setup.previewAccents,");
  });

  it("holds each photograph up by a different mechanism", () => {
    const kinds = TALK_SETUP_IDS.map((id) => TALK_SETUPS[id].kind);
    expect(new Set(kinds).size).toBe(TALK_SETUP_IDS.length);
  });

  it("gives each photograph its own edge treatment for the preview", () => {
    const stacks = TALK_SETUP_IDS.map((id) =>
      JSON.stringify(TALK_SETUPS[id].layers),
    );
    expect(new Set(stacks).size).toBe(TALK_SETUP_IDS.length);
  });

  it("keeps the demo-night preview faithful to its carved gilt frame", () => {
    const setup = TALK_SETUPS["talk-demo-night-v8"];
    expect(setup.layers.map((layer) => layer.tone)).toEqual([
      "pages",
      TALK_GILT,
      TALK_GILT_DEEP,
    ]);
    expect(setup.previewAccents).toContainEqual({
      kind: "corner-blocks",
      tone: TALK_GILT,
      size: 0.034,
      edgeInset: 0.017,
      radius: 0.004,
    });
  });

  it("keeps the hanging board recognizable in the preview", () => {
    const setup = TALK_SETUPS["talk-consensus-phone-v8"];
    expect(setup.layers).toHaveLength(1);
    expect(setup.previewAccents).toContainEqual({
      kind: "eyelets",
      tone: TALK_BRASS,
      radius: TALK_HANG.eyeletRadius,
      stroke: 0.003,
      spread: TALK_HANG.spread,
    });
  });

  it("cuts every image plane to its source file's ratio", () => {
    for (const id of TALK_SETUP_IDS) {
      const mismatch = artifactPlaneAspectMismatch(id, TALK_SETUPS[id].image);
      expect(mismatch, id).not.toBeNull();
      expect(mismatch!.relative, id).toBeLessThanOrEqual(
        ARTIFACT_PLANE_ASPECT_TOLERANCE,
      );
    }
  });

  it("puts every framed box's lowest corner exactly at its stated lift", () => {
    for (const id of TALK_SETUP_IDS) {
      const lowest = Math.min(...corners(id).map((corner) => corner[1]));
      expect(lowest, id).toBeCloseTo(TALK_SETUPS[id].lift, 6);
    }
  });

  it("keeps every framed box within its plank and under the shelf above", () => {
    for (const id of TALK_SETUP_IDS) {
      const setup = TALK_SETUPS[id];
      const span = PLANK_SPAN[setup.shelf];
      for (const corner of corners(id)) {
        expect(Math.abs(corner[0]), id).toBeLessThan(SHELF_GEOMETRY.width / 2);
        expect(corner[2], id).toBeLessThan(span.front);
        expect(corner[2], id).toBeGreaterThan(span.back);
        if (setup.shelf === "lower")
          expect(corner[1], id).toBeLessThan(LOWER_SHELF_HEADROOM);
      }
    }
  });

  // --- 1. leaning -----------------------------------------------------------

  it("leans the gilt frame against the bookcase post", () => {
    const setup = TALK_SETUPS["talk-demo-night-v8"];
    const framed = talkFramedSize(setup);
    // Steep enough that gravity holds it into the post, and the post is
    // within the frame's width so there is something to lean on.
    expect(setup.rest[0]).toBeLessThan(-0.2);
    expect(Math.abs(TALK_POST.x - setup.base[0])).toBeLessThan(
      framed.width / 2,
    );
    const contact = talkFramePoint(setup, [
      TALK_POST.x - setup.base[0],
      framed.height / 2,
      -(setup.thickness + 0.001),
    ]);
    expect(contact[2]).toBeCloseTo(TALK_POST.faceZ, 6);
    // The strap runs from the ground to the top plank: in lower-shelf local
    // coordinates the contact has to fall on that run.
    expect(contact[1]).toBeGreaterThan(0);
    expect(contact[1]).toBeLessThan(-SHELF_SURFACE.lower);
  });

  // --- 2. resting on furniture ---------------------------------------------

  it("lays the DC frame's back face along the easel's working plane", () => {
    const setup = TALK_SETUPS["talk-dc-policy-v8"];
    const framed = talkFramedSize(setup);
    for (const along of [-1, 1]) {
      const point = talkFramePoint(setup, [
        0,
        (along * framed.height) / 2,
        talkBoxCenterLocalZ(setup),
      ]);
      // Within 2mm of the plane over the whole face — the easel's yaw adds a
      // sub-millimetre cross-term at the corners, nothing more.
      expect(Math.abs(point[2] - talkEaselPlaneZ(point[1]))).toBeLessThan(
        0.002,
      );
    }
    // Both bottom corners touch the tray, i.e. the settle roll levelled it.
    const trayFront = talkEaselPlaneZ(TALK_EASEL.trayY) + TALK_EASEL.trayDepth;
    for (const side of [-1, 1]) {
      const corner = talkFramePoint(setup, [
        (side * framed.width) / 2,
        -framed.height / 2,
        talkBoxCenterLocalZ(setup),
      ]);
      expect(corner[1]).toBeCloseTo(TALK_EASEL.trayY, 3);
      expect(corner[2]).toBeLessThan(trayFront - TALK_EASEL.lipThickness);
    }
    // The crossbar backs the frame instead of poking past it.
    const top = talkFramePoint(setup, [0, framed.height / 2, 0]);
    expect(TALK_EASEL.crossbarY).toBeLessThan(top[1]);
    expect(TALK_EASEL.crossbarY).toBeGreaterThan(TALK_EASEL.trayY);
  });

  it("sets the easel's brass lip proud of the tray front", () => {
    const trayFront = TALK_EASEL.trayDepth / 2;
    const lipFront = talkEaselLipCenterLocalZ() + TALK_EASEL.lipThickness / 2;
    expect(lipFront - trayFront).toBeGreaterThanOrEqual(0.002);
  });

  it("keeps the whole easel below the frame's top edge", () => {
    // The easel is one static collision island, so its bounding box — not
    // just the part near the Perch — is what an insect landing on the frame's
    // top edge has to clear. Leg tops standing proud of that edge made
    // `talks:dc-policy-frame-top` permanently resting-pose-blocked.
    const edge = talkPerchPose("talk-dc-policy-v8").position;
    expect(edge[1] - talkEaselMastTop()).toBeGreaterThan(0.05);
  });

  // --- 3. cantilevered from behind -----------------------------------------

  it("carries the studio panel entirely on the arm", () => {
    const setup = TALK_SETUPS["talk-ann-interview-v8"];
    const mount = talkArmMount();
    // Nothing under it: the lowest corner floats well clear of the wood.
    expect(setup.lift).toBeGreaterThan(0.12);
    // The head meets the panel's actual back plane, not a guessed offset.
    expect(mount.head[2]).toBeCloseTo(
      talkBackPlaneZ(setup, setup.base[0], mount.head[1]),
      9,
    );
    // The head is at the panel's own centre height, so the mount is not
    // holding a moment the counterweight was never sized for.
    expect(mount.head[1]).toBeCloseTo(talkSeat(setup), 9);
    // The boom genuinely reaches forward from the clamp to the panel.
    expect(mount.boomToZ).toBeGreaterThan(mount.boomFromZ + 0.15);
    // The clamp bites the plank's back edge rather than floating past it.
    const backEdge = PLANK_SPAN.top.back;
    expect(TALK_ARM.clampZ - TALK_ARM.clampDepth / 2).toBeGreaterThan(backEdge);
    expect(TALK_ARM.clampZ - TALK_ARM.clampDepth / 2 - 0.02).toBeLessThan(
      backEdge + 0.04,
    );
  });

  it("keeps the arm clear of the panel's top edge", () => {
    const edge = talkPerchPose("talk-ann-interview-v8").position;
    const armTop = TALK_ARM.boomY + TALK_ARM.boomThickness / 2;
    expect(edge[1] - armTop).toBeGreaterThan(0.05);
  });

  // --- 4. hanging in tension -----------------------------------------------

  it("hangs the Consensus board plumb from the shelf above", () => {
    const setup = TALK_SETUPS["talk-consensus-phone-v8"];
    // A board in pure tension has no pitch and no roll. Only yaw is free.
    expect(setup.rest[0]).toBe(0);
    expect(setup.rest[2]).toBe(0);
    // It touches nothing below it.
    expect(setup.lift).toBeGreaterThan(0.2);
    const wires = talkHangWires();
    expect(wires).toHaveLength(2);
    for (const wire of wires) {
      // Plumb: the anchor is directly above the eyelet in both x and z.
      expect(wire.anchor[0]).toBeCloseTo(wire.eyelet[0], 9);
      expect(wire.anchor[2]).toBeCloseTo(wire.eyelet[2], 9);
      // A real drop, ending on the underside of the plank above.
      expect(wire.length).toBeGreaterThan(0.06);
      expect(wire.anchor[1]).toBeCloseTo(LOWER_SHELF_HEADROOM, 9);
      // And the anchor plate lands on the plank, not out in the room.
      expect(wire.anchor[2]).toBeLessThan(PLANK_SPAN.top.front);
      expect(wire.anchor[2]).toBeGreaterThan(PLANK_SPAN.top.back);
    }
    // The two wires straddle the board's centre, set inboard of the corners
    // where an eyelet would really be punched.
    expect(wires[0]!.eyelet[0]).toBeLessThan(setup.base[0]);
    expect(wires[1]!.eyelet[0]).toBeGreaterThan(setup.base[0]);
    expect(TALK_HANG.spread).toBeGreaterThan(0.5);
    expect(TALK_HANG.spread).toBeLessThan(1);
  });

  it("leaves headroom between the hung board and the plank above", () => {
    const highest = Math.max(
      ...corners("talk-consensus-phone-v8").map((corner) => corner[1]),
    );
    expect(LOWER_SHELF_HEADROOM - highest).toBeGreaterThan(0.05);
  });

  // --- 5. gripped in a slot -------------------------------------------------

  it("seats the panel print in the plinth's slot", () => {
    const setup = TALK_SETUPS["talk-panel-v8"];
    const framed = talkFramedSize(setup);
    // The print's bottom mid-plane sits on the slot's centreline, so the
    // stone grips it rather than the print hovering in a decorative groove.
    const mid = talkFramePoint(setup, [
      0,
      -framed.height / 2,
      talkBoxCenterLocalZ(setup),
    ]);
    expect(mid[2]).toBeCloseTo(TALK_PLINTH_SLOT_Z, 6);
    // It reclines rather than standing upright — a slot that only held a
    // vertical print would need to grip far harder than stone does.
    expect(setup.rest[0]).toBeLessThan(-0.15);
    // The slot grips the print's middle and is narrower than the stone.
    expect(TALK_PLINTH.slotWidth).toBeGreaterThan(framed.width * 0.6);
    expect(TALK_PLINTH.slotWidth).toBeLessThan(TALK_PLINTH.width);
    // A print may overhang its plinth — that is what a plinth looks like —
    // but not so far that the stone reads as a peg under a billboard.
    for (const side of [-1, 1]) {
      const corner = talkFramePoint(setup, [
        (side * framed.width) / 2,
        -framed.height / 2,
        talkBoxCenterLocalZ(setup),
      ]);
      const overhang =
        Math.abs(corner[0] - TALK_PLINTH.x) - TALK_PLINTH.width / 2;
      expect(overhang).toBeLessThan(framed.width / 6);
    }
  });

  it("cuts the slot into the plinth's cap", () => {
    const height = talkPlinthHeight();
    expect(TALK_PLINTH.slotFloorY).toBeLessThan(height);
    expect(TALK_PLINTH.slotFloorY).toBeGreaterThan(
      height - TALK_PLINTH.capHeight,
    );
  });

  it("keeps the plinth clear of the print's top edge", () => {
    const edge = talkPerchPose("talk-panel-v8").position;
    expect(edge[1] - talkPlinthHeight()).toBeGreaterThan(0.05);
  });

  // --- shared invariants ----------------------------------------------------

  it("keeps same-shelf neighbours from interpenetrating", () => {
    for (const shelf of ["top", "lower"] as const) {
      const ids = TALK_SETUP_IDS.filter(
        (id) => TALK_SETUPS[id].shelf === shelf,
      );
      for (let a = 0; a < ids.length; a += 1)
        for (let b = a + 1; b < ids.length; b += 1) {
          const boxA = corners(ids[a]!);
          const boxB = corners(ids[b]!);
          const overlaps = (axis: number) =>
            Math.min(...boxA.map((p) => p[axis]!)) <
              Math.max(...boxB.map((p) => p[axis]!)) &&
            Math.min(...boxB.map((p) => p[axis]!)) <
              Math.max(...boxA.map((p) => p[axis]!));
          // Two prints may share an x range only if they are clearly apart
          // in depth or in height.
          if (!overlaps(0)) continue;
          const gap = (axis: number) =>
            Math.max(
              Math.min(...boxA.map((p) => p[axis]!)) -
                Math.max(...boxB.map((p) => p[axis]!)),
              Math.min(...boxB.map((p) => p[axis]!)) -
                Math.max(...boxA.map((p) => p[axis]!)),
            );
          expect(
            Math.max(gap(1), gap(2)),
            `${ids[a]} vs ${ids[b]}`,
          ).toBeGreaterThan(0.04);
        }
    }
  });

  it("computes seats that match the corner solve", () => {
    // talkSeat is the render path; the corner sweep is the test's own
    // derivation. They must agree for every pose.
    for (const id of TALK_SETUP_IDS) {
      const setup = TALK_SETUPS[id];
      const lowestOffset = Math.min(
        ...corners(id).map((corner) => corner[1] - talkSeat(setup)),
      );
      expect(talkSeat(setup) + lowestOffset, id).toBeCloseTo(setup.lift, 6);
    }
  });

  it("anchors every insect Perch on the solid, not on the image plane", () => {
    // The image plane is local z 0 and the framed solid hangs behind it. A
    // Perch authored at z 0 sits in mid-air in front of the print, the
    // downward probe ray misses the geometry, and the resolver either fails
    // outright or falls back to a lattice point far from the anchor. That is
    // exactly how the panel print ended up unlandable.
    for (const id of TALK_SETUP_IDS) {
      const setup = TALK_SETUPS[id];
      const framed = talkFramedSize(setup);
      const pose = talkPerchPose(id);
      const onImagePlane = talkFramePoint(setup, [0, framed.height / 2, 0]);
      const offset = Math.hypot(
        pose.position[0] - onImagePlane[0],
        pose.position[1] - onImagePlane[1],
        pose.position[2] - onImagePlane[2],
      );
      // It sits back by exactly the solid's half depth plus the face gap.
      expect(offset, id).toBeCloseTo(Math.abs(talkBoxCenterLocalZ(setup)), 9);
      // The normal is the face's own up, so a tilted print is landed on at
      // the angle it actually presents.
      expect(Math.hypot(...pose.normal), id).toBeCloseTo(1, 9);
    }
  });
});
