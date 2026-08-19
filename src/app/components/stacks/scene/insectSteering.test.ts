// Roaming invariants are statistical and behavioural now, not exact. With soft
// collision there is no corridor to prove clear, and with per-insect wander
// there is no shared path to find — so what these tests bound is the character
// of the motion: where residents spend their time, that they keep moving, that
// they use the whole volume, and that no two of them fly the same line.
//
// A green suite here is not an approval. It bounds the model; the owner's
// visual review is what accepts it.
import { describe, expect, it } from "vitest";

import {
  type InsectCollisionBox,
  insectDistanceField,
  reviseInsectCollisionIndex,
} from "./insectCollision";
import {
  BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  createInsectFlightVolume,
  createInsectFlightVolumeContainment,
  insectFlightVolumeContains,
  insectFlightVolumeLocal,
  insectFlightVolumeRegion,
} from "./insectFlightVolume";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectFlightWorld,
  type InsectKinematicSample,
  type PilotVector,
  advanceInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import { BUTTERFLY_STEERING_PROFILE } from "./insectSteering";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { unitPose } from "./worldLayout";

const UNIT = 0;
const VOLUME = createInsectFlightVolume(unitPose(UNIT));
const CONTAINMENT = createInsectFlightVolumeContainment(VOLUME);

/** The two planks and their end straps, in world space. Enough real geometry
 * for repulsion to have something to do. */
function shelfBoxes(): InsectCollisionBox[] {
  const pose = unitPose(UNIT);
  const boxes: InsectCollisionBox[] = [];
  const add = (
    id: string,
    center: readonly [number, number, number],
    size: readonly [number, number, number],
  ) =>
    boxes.push({
      id,
      min: {
        x: pose.position[0] + center[0] - size[0] / 2,
        y: center[1] - size[1] / 2,
        z: pose.position[2] + center[2] - size[2] / 2,
      },
      max: {
        x: pose.position[0] + center[0] + size[0] / 2,
        y: center[1] + size[1] / 2,
        z: pose.position[2] + center[2] + size[2] / 2,
      },
    });
  for (const plank of ["top", "lower"] as const) {
    const shelf = SHELF_GEOMETRY[plank];
    add(
      `plank:${plank}`,
      [0, shelf.centerY, shelf.centerZ],
      [SHELF_GEOMETRY.width, shelf.thickness, shelf.depth],
    );
  }
  for (const side of [-1, 1])
    add(
      `strap:${side}`,
      [
        side * (SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX),
        SHELF_GEOMETRY.groundY / 2,
        SHELF_GEOMETRY.strapZ,
      ],
      [
        SHELF_GEOMETRY.support.width,
        -SHELF_GEOMETRY.groundY,
        SHELF_GEOMETRY.support.width,
      ],
    );
  return boxes;
}

const INDEX = reviseInsectCollisionIndex(null, shelfBoxes());

/** Soft collision only: this world can measure the scene but never forbids a
 * movement, which is the whole of ADR 0002. */
class SoftFlightWorld implements InsectFlightWorld {
  sweeps = 0;
  sampleCruise() {
    throw new Error("a steering resident must never sample an analytic flight");
  }
  sampleDistanceField(point: PilotVector, outGradient: PilotVector) {
    return insectDistanceField(point, INDEX, outGradient);
  }
  sweepSphere() {
    this.sweeps++;
    return true;
  }
  tryReserve() {
    return true;
  }
  release() {
    /* no reservations are taken in these tests */
  }
}

function resident(index: number) {
  const initial: InsectKinematicSample = {
    position: {
      x: unitPose(UNIT).position[0] + (index % 3) * 0.4 - 0.4,
      y: -0.3 + (index % 2) * 0.2,
      z: unitPose(UNIT).position[2] + 1.1,
    },
    velocity: { x: 0.2, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
  };
  return createInsectPilot({
    occupantId: `butterfly:${index}`,
    flightId: index,
    seed: 104729 * (index + 1),
    initialTime: 0,
    initial,
    profile: BUTTERFLY_PILOT_PROFILE,
    roam: {
      profile: BUTTERFLY_STEERING_PROFILE,
      containment: CONTAINMENT,
      volume: VOLUME,
      transit: null,
    },
  });
}

type Track = {
  samples: PilotVector[];
  speeds: number[];
  regions: { front: number; rear: number };
  minLocalY: number;
  maxLocalY: number;
  stalledFrames: number;
};

function fly(count: number, seconds: number, frameRate = 60) {
  const world = new SoftFlightWorld();
  const pilots = Array.from({ length: count }, (_, index) => resident(index));
  const tracks: Track[] = pilots.map(() => ({
    samples: [],
    speeds: [],
    regions: { front: 0, rear: 0 },
    minLocalY: Number.POSITIVE_INFINITY,
    maxLocalY: Number.NEGATIVE_INFINITY,
    stalledFrames: 0,
  }));
  const local = { x: 0, y: 0, z: 0 };
  for (let frame = 0; frame < seconds * frameRate; frame++)
    for (let index = 0; index < pilots.length; index++) {
      const pilot = pilots[index]!;
      const track = tracks[index]!;
      advanceInsectPilot(pilot, 1 / frameRate, world);
      const speed = Math.hypot(
        pilot.velocity.x,
        pilot.velocity.y,
        pilot.velocity.z,
      );
      track.speeds.push(speed);
      if (speed < 0.08) track.stalledFrames++;
      track.regions[insectFlightVolumeRegion(VOLUME, pilot.position)]++;
      insectFlightVolumeLocal(VOLUME, pilot.position, local);
      track.minLocalY = Math.min(track.minLocalY, local.y);
      track.maxLocalY = Math.max(track.maxLocalY, local.y);
      if (frame % 6 === 0) track.samples.push({ ...pilot.position });
    }
  return { pilots, tracks, world };
}

describe("steering roam", () => {
  it("stays inside the Flight Volume over three minutes of flight", () => {
    const { pilots, tracks } = fly(6, 180);

    for (let index = 0; index < pilots.length; index++)
      for (const sample of tracks[index]!.samples)
        expect(insectFlightVolumeContains(VOLUME, sample, 0.06)).toBe(true);
  });

  it("never asks the world whether a roaming movement is allowed", () => {
    const { world } = fly(3, 60);

    // Roaming has no sweep gate at all: geometry bends the insect through the
    // distance field instead of forbidding a step.
    expect(world.sweeps).toBe(0);
  });

  it("uses the whole vertical range instead of a slab between the planks", () => {
    const { tracks } = fly(6, 180);
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;
    const span = extent.maxY - extent.minY;
    const lowest = Math.min(...tracks.map((track) => track.minLocalY));
    const highest = Math.max(...tracks.map((track) => track.maxLocalY));

    // Well above the top plank and well below it, rather than inside the 21 cm
    // of dead air between the planks that both rejected implementations lived
    // in. The volume's floor stops just above the flower heads, so the band
    // under the lower plank is not somewhere anyone is meant to fly.
    expect(highest).toBeGreaterThan(SHELF_GEOMETRY.top.centerY + 0.5);
    expect(lowest).toBeLessThan(SHELF_GEOMETRY.lower.centerY + 0.3);
    expect(highest - lowest).toBeGreaterThan(span * 0.6);
  });

  it("spends most of its time on the camera side", () => {
    const { tracks } = fly(6, 240);
    const front = tracks.reduce((sum, track) => sum + track.regions.front, 0);
    const rear = tracks.reduce((sum, track) => sum + track.regions.rear, 0);
    const share = front / (front + rear);

    // Authored at roughly three-quarters forward. The band is wide because the
    // drift biases residency rather than fencing anyone in.
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.95);
  });

  it("keeps moving, at an inconstant speed", () => {
    const { tracks } = fly(6, 120);

    for (const track of tracks) {
      // Under half a percent of frames below the stall threshold.
      expect(track.stalledFrames / track.speeds.length).toBeLessThan(0.005);
      const mean =
        track.speeds.reduce((sum, speed) => sum + speed, 0) /
        track.speeds.length;
      const spread = Math.sqrt(
        track.speeds.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) /
          track.speeds.length,
      );
      expect(mean).toBeGreaterThan(0.2);
      expect(mean).toBeLessThan(BUTTERFLY_PILOT_PROFILE.maxSpeed);
      // "An erratic trajectory at an inconstant speed": a flat speed would be
      // the giveaway that the path, not the insect, is in charge.
      expect(spread / mean).toBeGreaterThan(0.12);
    }
  });

  it("gives no two residents the same line through the air", () => {
    const { tracks } = fly(6, 180);

    for (let a = 0; a < tracks.length; a++)
      for (let b = a + 1; b < tracks.length; b++) {
        // For each sample on A, how close does B's whole track come? If two
        // residents shared a corridor this would collapse toward zero.
        let closest = 0;
        for (const sample of tracks[a]!.samples) {
          let nearest = Number.POSITIVE_INFINITY;
          for (const other of tracks[b]!.samples)
            nearest = Math.min(
              nearest,
              Math.hypot(
                sample.x - other.x,
                sample.y - other.y,
                sample.z - other.z,
              ),
            );
          closest += nearest;
        }
        const mean = closest / tracks[a]!.samples.length;
        expect(mean).toBeGreaterThan(0.05);
      }
  });

  it("bends away from the shelf instead of settling against it", () => {
    const { pilots, tracks } = fly(6, 180);
    const gradient = { x: 0, y: 0, z: 0 };
    let contacts = 0;
    let total = 0;
    for (const track of tracks)
      for (const sample of track.samples) {
        total++;
        if (insectDistanceField(sample, INDEX, gradient) < 0) contacts++;
      }

    // Soft collision accepts a rare shallow clip and buys the whole visual
    // result with it. What it must not do is let an insect live inside a plank.
    expect(contacts / total).toBeLessThan(0.01);
    expect(pilots.every((pilot) => pilot.phase === "roam")).toBe(true);
  });

  it("produces the same flight at 30, 60, and 120 Hz to within a few centimetres", () => {
    const at = (rate: number) => {
      const world = new SoftFlightWorld();
      const pilot = resident(0);
      for (let frame = 0; frame < 20 * rate; frame++)
        advanceInsectPilot(pilot, 1 / rate, world);
      return pilot;
    };
    const slow = at(30);
    const normal = at(60);
    const fast = at(120);

    // The fixed 120 Hz substep makes the trajectory identical; only the
    // leftover accumulator differs between callers.
    for (const other of [normal, fast])
      expect(
        Math.hypot(
          slow.position.x - other.position.x,
          slow.position.y - other.position.y,
          slow.position.z - other.position.z,
        ),
      ).toBeLessThan(0.03);
  });
});
