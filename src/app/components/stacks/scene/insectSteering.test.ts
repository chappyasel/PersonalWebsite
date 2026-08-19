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
import {
  BUTTERFLY_STEERING_PROFILE,
  MOTH_STEERING_PROFILE,
  createInsectSteeringState,
  nudgeInsectSteering,
} from "./insectSteering";
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
      evade: null,
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

/**
 * Fly the same residents twice — once ignoring a fixed point in the room, once
 * leaning away from it — and report where each spent its time.
 *
 * The "cursor" is a world point rather than a screen position because the
 * conversion from pixels is the renderer's job (see `BUTTERFLY_EVASION`); what
 * the Intent Layer is handed, and all this needs, is a direction and a
 * strength.
 */
function flyPast(cursor: PilotVector, seconds: number, evading: boolean) {
  const world = new SoftFlightWorld();
  const pilots = Array.from({ length: 6 }, (_, index) => resident(index));
  const away = { x: 0, y: 0, z: 0, strength: 0 };
  let near = 0;
  let total = 0;
  let stalled = 0;
  let approaching = 0;
  for (let frame = 0; frame < seconds * 60; frame++)
    for (const pilot of pilots) {
      if (evading && pilot.roam) {
        const dx = pilot.position.x - cursor.x;
        const dy = pilot.position.y - cursor.y;
        const dz = pilot.position.z - cursor.z;
        const distance = Math.hypot(dx, dy, dz) || 1;
        const strength = distance < 0.9 ? (1 - distance / 0.9) ** 2 : 0;
        away.x = dx / distance;
        away.y = dy / distance;
        away.z = dz / distance;
        away.strength = strength;
        pilot.roam.evade = strength > 0 ? away : null;
      }
      advanceInsectPilot(pilot, 1 / 60, world);
      const distance = Math.hypot(
        pilot.position.x - cursor.x,
        pilot.position.y - cursor.y,
        pilot.position.z - cursor.z,
      );
      total++;
      if (distance < 0.55) near++;
      if (
        Math.hypot(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z) < 0.08
      )
        stalled++;
      if (
        distance < 0.9 &&
        (cursor.x - pilot.position.x) * pilot.velocity.x +
          (cursor.y - pilot.position.y) * pilot.velocity.y +
          (cursor.z - pilot.position.z) * pilot.velocity.z >
          0
      )
        approaching++;
    }
  return { near: near / total, stalled: stalled / total, approaching };
}

describe("pointer evasion", () => {
  const cursor: PilotVector = {
    x: unitPose(UNIT).position[0],
    y: -0.2,
    z: unitPose(UNIT).position[2] + 1.1,
  };

  it("keeps residents out of the cursor's immediate neighbourhood", () => {
    const ignoring = flyPast(cursor, 60, false);
    const evading = flyPast(cursor, 60, true);

    expect(ignoring.near).toBeGreaterThan(0.01);
    expect(evading.near).toBeLessThan(ignoring.near * 0.65);
  });

  it("saturates, which is why the bias can stay small", () => {
    // Measured across evadeBias 2.4 / 3.2 / 4.0 / 5.0, dwell inside the
    // cursor's neighbourhood moved 43% -> 50%. Doubling the strength buys
    // seven points, because what bounds the dwell is the size of the
    // neighbourhood and not the force turning the insect out of it — a
    // resident still has to cross the room. That is the whole argument for
    // authoring this at the bottom of the curve: everything above it is a
    // visibly harder shove for almost nothing.
    expect(BUTTERFLY_STEERING_PROFILE.evadeBias).toBeLessThan(
      BUTTERFLY_STEERING_PROFILE.containBias,
    );
    // Moths evade harder, on the owner's call. What keeps that safe is the
    // same relation, not a smaller number: the Lamp Cone has to stay able to
    // out-argue the cursor, or a moth chased hard enough leaves the light —
    // and a moth outside the light is the defect ADR 0007 exists to fix.
    expect(MOTH_STEERING_PROFILE.evadeBias).toBeGreaterThan(
      BUTTERFLY_STEERING_PROFILE.evadeBias,
    );
    expect(MOTH_STEERING_PROFILE.evadeBias).toBeLessThan(
      MOTH_STEERING_PROFILE.containBias,
    );
  });

  it("is a lean, not a repulsor: residents still fly at the cursor sometimes", () => {
    // The distinction the owner asked for is "subtly elusive", and the failure
    // mode on the other side of it is a room where the pointer visibly pushes
    // wildlife around — at which point the cursor is a weapon and the insects
    // are objects. Composed against the wander, an evading resident that is
    // already turning your way sometimes keeps coming.
    const evading = flyPast(cursor, 60, true);
    expect(evading.approaching).toBeGreaterThan(0);
  });

  it("never pins or stalls a resident it is pushing", () => {
    // A bias strong enough to hold an insect against its containment would
    // stop it, and a motionless insect is worse than no insect.
    const evading = flyPast(cursor, 60, true);
    expect(evading.stalled).toBeLessThan(0.02);
  });
});

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

  it("breaks a steering fixed point rather than only reporting one", () => {
    // A controller that sums containment, repulsion, drift and wander can sum
    // to zero, and a resident that finds that point stays in it — owner
    // review: "butterflies still sometimes freeze in midair which I'd rather
    // avoid." The nudge has to actually MOVE the wander term, because the
    // wander term is what makes the equilibrium an equilibrium.
    const state = createInsectSteeringState(11);
    const before = {
      x: state.wanderX,
      y: state.wanderY,
      z: state.wanderZ,
      phase: state.speedPhase,
    };
    const out = { x: 0, y: 0, z: 0 };
    nudgeInsectSteering(state, out);

    expect(
      Math.hypot(
        state.wanderX - before.x,
        state.wanderY - before.y,
        state.wanderZ - before.z,
      ),
    ).toBeGreaterThan(0.1);
    expect(state.speedPhase).not.toBe(before.phase);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
    // Up is the one direction a shelf never blocks, and a stalled insect is
    // usually wedged under or beside something.
    expect(out.y).toBeGreaterThan(0);

    // Successive nudges must not repeat, or an insect that re-stalls in the
    // same corner is handed the same useless escape.
    const second = { x: 0, y: 0, z: 0 };
    nudgeInsectSteering(state, second);
    expect(
      Math.hypot(out.x - second.x, out.y - second.y, out.z - second.z),
    ).toBeGreaterThan(0.05);
  });
});
