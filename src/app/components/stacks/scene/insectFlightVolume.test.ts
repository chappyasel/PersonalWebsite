import { describe, expect, it } from "vitest";

import {
  BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  clampToInsectFlightVolume,
  createInsectFlightVolume,
  insectFlightVolumeContainment,
  insectFlightVolumeContains,
  insectFlightVolumeDirection,
  insectFlightVolumeLocal,
  insectFlightVolumeLocalDirection,
  insectFlightVolumePoint,
  insectFlightVolumeRegion,
  insectFlightVolumeResidencyDrift,
} from "./insectFlightVolume";
import { MEADOW_GROUND_BASE } from "./meadowField";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { UNIT_SPACING, unitPose } from "./worldLayout";

const YAWED = createInsectFlightVolume(unitPose(1));

describe("Flight Volume extent", () => {
  it("spans real air rather than the gap between the shelf planks", () => {
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;

    // Above the flower heads, below nothing: the two rejected implementations
    // both flew in the 21 cm slab between the planks and never went anywhere
    // vertically, which is the motion a butterfly is most recognizable by.
    expect(extent.minY).toBeGreaterThan(MEADOW_GROUND_BASE);
    expect(extent.minY).toBeLessThan(SHELF_GEOMETRY.lower.centerY);
    expect(extent.maxY).toBeGreaterThan(1);
    expect(extent.maxY - extent.minY).toBeGreaterThan(2);

    // Wider than the shelf, and reaching well past its front face toward the
    // camera rather than sitting behind it.
    expect(extent.halfWidth).toBeGreaterThan(SHELF_GEOMETRY.width / 2);
    expect(extent.maxZ).toBeGreaterThan(SHELF_GEOMETRY.top.depth);
    expect(extent.frontZ).toBeGreaterThan(SHELF_GEOMETRY.top.depth / 2);
  });
});

describe("Flight Volume frame", () => {
  it("round-trips a point through a yawed, offset Unit", () => {
    const local = { x: 0.8, y: 0.3, z: 1.4 };
    const world = { x: 0, y: 0, z: 0 };
    const back = { x: 0, y: 0, z: 0 };

    insectFlightVolumePoint(YAWED, local, world);
    insectFlightVolumeLocal(YAWED, world, back);

    expect(back.x).toBeCloseTo(local.x, 10);
    expect(back.y).toBeCloseTo(local.y, 10);
    expect(back.z).toBeCloseTo(local.z, 10);
    // And it really is somewhere else in the world, so the round trip is not
    // passing because the transform is the identity.
    expect(Math.hypot(world.x - local.x, world.z - local.z)).toBeGreaterThan(1);
  });

  it("reads residency in the Unit's own frame, not the world's", () => {
    const front = { x: 0, y: 0, z: 0 };
    const rear = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, { x: 1.4, y: 0.2, z: 2 }, front);
    insectFlightVolumePoint(YAWED, { x: 1.4, y: 0.2, z: -1 }, rear);

    expect(insectFlightVolumeRegion(YAWED, front)).toBe("front");
    expect(insectFlightVolumeRegion(YAWED, rear)).toBe("rear");
  });
});

describe("Flight Volume containment", () => {
  const force = (local: { x: number; y: number; z: number }) => {
    const world = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, local, world);
    const out = { x: 0, y: 0, z: 0 };
    const severity = insectFlightVolumeContainment(YAWED, world, out);
    // Containment is a world-space force; read it back in the Unit frame so
    // the assertions can talk about "up" and "toward the camera".
    const inFrame = { x: 0, y: 0, z: 0 };
    insectFlightVolumeLocalDirection(YAWED, out, inFrame);
    return { severity, ...inFrame };
  };

  it("is inert in the middle of the volume except for the camera-side drift", () => {
    const middle = force({ x: 0, y: 0.1, z: 1.4 });

    expect(middle.severity).toBe(0);
    expect(Math.abs(middle.x)).toBeLessThan(1e-9);
    expect(Math.abs(middle.y)).toBeLessThan(1e-9);
    expect(Math.abs(middle.z)).toBeLessThan(1e-9);
  });

  it("pushes back inward from every boundary", () => {
    expect(force({ x: 2.15, y: 0.1, z: 1.4 }).x).toBeLessThan(0);
    expect(force({ x: -2.15, y: 0.1, z: 1.4 }).x).toBeGreaterThan(0);
    expect(force({ x: 0, y: 1.2, z: 1.4 }).y).toBeLessThan(0);
    expect(force({ x: 0, y: -0.92, z: 1.4 }).y).toBeGreaterThan(0);
    expect(force({ x: 0, y: 0.1, z: 2.35 }).z).toBeLessThan(0);
    // The rear boundary and the residency drift push the same way, so this one
    // is only interesting as a sign check.
    expect(force({ x: 0, y: 0.1, z: -1.35 }).z).toBeGreaterThan(0);
    expect(force({ x: 2.15, y: 0.1, z: 1.4 }).severity).toBeGreaterThan(0.5);
  });
});

describe("Flight Volume residency lean", () => {
  const lean = (local: { x: number; y: number; z: number }) => {
    const world = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, local, world);
    const out = { x: 0, y: 0, z: 0 };
    const strength = insectFlightVolumeResidencyDrift(YAWED, world, out);
    const inFrame = { x: 0, y: 0, z: 0 };
    insectFlightVolumeLocalDirection(YAWED, out, inFrame);
    return { strength, ...inFrame };
  };

  it("leans the rear half toward the camera and leaves the front half alone", () => {
    // Always the Unit's own forward, in world terms.
    expect(lean({ x: 0, y: 0.1, z: -1 }).z).toBeCloseTo(1, 6);

    expect(lean({ x: 0, y: 0.1, z: -1 }).strength).toBeGreaterThan(
      lean({ x: 0, y: 0.1, z: 0.2 }).strength,
    );
    expect(lean({ x: 0, y: 0.1, z: 0.2 }).strength).toBeGreaterThan(0);
    expect(lean({ x: 0, y: 0.1, z: 1 }).strength).toBe(0);
    expect(lean({ x: 0, y: 0.1, z: 2.2 }).strength).toBe(0);
  });
});

describe("Flight Volume clamp", () => {
  it("keeps a velocity that is not the reason the point left", () => {
    // Only the outward component on a clamped axis is removed. Zeroing the
    // whole velocity is what made the boundary sticky.
    const grazing = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, { x: 0.2, y: 1.6, z: 1 }, grazing);
    const travelling = { x: 0, y: 0, z: 0 };
    insectFlightVolumeDirection(YAWED, { x: 0.5, y: 0.4, z: 0.3 }, travelling);

    expect(clampToInsectFlightVolume(YAWED, grazing, travelling, 0.05)).toBe(
      true,
    );
    const inFrame = { x: 0, y: 0, z: 0 };
    insectFlightVolumeLocalDirection(YAWED, travelling, inFrame);
    expect(inFrame.y).toBe(0);
    expect(inFrame.x).toBeCloseTo(0.5, 6);
    expect(inFrame.z).toBeCloseTo(0.3, 6);
  });

  it("only fires outside the volume, and puts the point back in it", () => {
    const inside = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, { x: 0, y: 0.2, z: 1 }, inside);
    const still = { x: 0, y: 0, z: 0 };
    expect(clampToInsectFlightVolume(YAWED, inside, still, 0.05)).toBe(false);

    const outside = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(YAWED, { x: 4, y: 6, z: -9 }, outside);
    const escaping = { x: 0.4, y: 0.3, z: -0.5 };
    expect(clampToInsectFlightVolume(YAWED, outside, escaping, 0.05)).toBe(
      true,
    );
    expect(insectFlightVolumeContains(YAWED, outside, 0.06)).toBe(true);
  });
});

describe("Flight Volume shared faces", () => {
  const OPEN = createInsectFlightVolume(unitPose(1), undefined, {
    minX: true,
    maxX: true,
  });
  const severityAt = (localX: number, volume = OPEN) => {
    const world = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(volume, { x: localX, y: 0.1, z: 1.4 }, world);
    const out = { x: 0, y: 0, z: 0 };
    return insectFlightVolumeContainment(volume, world, out);
  };

  it("tiles: the half-width is exactly half the Unit spacing", () => {
    // A 0.4 m band of air belonging to nobody sat between every pair of
    // shelves; nothing could cross it even in principle (ADR 0004).
    expect(BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth * 2).toBeCloseTo(
      UNIT_SPACING,
      9,
    );
  });

  it("lets a resident cross a shared face, and stops it at a room end", () => {
    // The seam itself must be reachable: migration is only safe at the point
    // where the neighbour ALREADY contains the insect, and that point is one
    // the containment would otherwise never let anyone get to.
    expect(severityAt(BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth)).toBe(0);
    expect(
      severityAt(
        BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth +
          BUTTERFLY_FLIGHT_VOLUME_EXTENT.handoff,
      ),
    ).toBeGreaterThan(0.5);

    const closed = createInsectFlightVolume(unitPose(1));
    expect(
      severityAt(BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth, closed),
    ).toBeGreaterThan(0.5);
  });

  it("never clamps a point the neighbour would have adopted", () => {
    // The clamp is a hard position write. If it fired inside the handoff band
    // it would be the teleport, wearing a different name.
    const world = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(
      OPEN,
      { x: BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth + 0.1, y: 0.1, z: 1.4 },
      world,
    );
    const velocity = { x: 0.4, y: 0, z: 0 };
    expect(clampToInsectFlightVolume(OPEN, world, velocity, 0.05)).toBe(false);
  });

  it("membership stays at the authored face, not the handoff band", () => {
    const world = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(
      OPEN,
      { x: BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth + 0.1, y: 0.1, z: 1.4 },
      world,
    );
    expect(insectFlightVolumeContains(OPEN, world)).toBe(false);
  });
});
