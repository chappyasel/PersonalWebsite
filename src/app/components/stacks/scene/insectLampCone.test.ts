// What has to hold for the second containment shape: that it is a cone, that
// it is SOFT (the whole point — a moth that cannot leave the light is the
// defect this replaces), and that the one hard operation in it only ever fires
// far outside the beam.
import { describe, expect, it } from "vitest";

import {
  type InsectLampCone,
  clampToInsectLampCone,
  createInsectLampCone,
  createInsectLampConeContainment,
  insectLampConeContainment,
  insectLampConeResidencyDrift,
  lampConeAxialMin,
  lampConeContainsPoint,
  lampConeLocal,
  lampConeOuterRadius,
  lampConeRadius,
} from "./insectLampCone";
import { createLampConeLocal } from "./insectLampCone";
import {
  MOTH_PILOT_PROFILE,
  advanceInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import { MOTH_STEERING_PROFILE } from "./insectSteering";
import { MOTH_LIGHT_PROFILES } from "./meadowLights";
import { MOTH_ILLUMINATION, mothIllumination } from "./wildlifeBehavior";

const floorLamp = (): InsectLampCone => ({
  ...createInsectLampCone(),
  sourceX: 3,
  sourceY: 1.4,
  sourceZ: -0.2,
  dirX: 0,
  dirY: -1,
  dirZ: 0,
  forwardX: 0,
  forwardY: 0,
  forwardZ: 1,
  nearDistance: MOTH_LIGHT_PROFILES.floor.nearDistance,
  farDistance: MOTH_LIGHT_PROFILES.floor.farDistance,
  maxRadius: MOTH_LIGHT_PROFILES.floor.maxRadius,
});

const at = (cone: InsectLampCone, axial: number, radial: number) => ({
  x: cone.sourceX,
  y: cone.sourceY - axial,
  z: cone.sourceZ + radial,
});

describe("Lamp Cone", () => {
  it("widens with depth down the beam", () => {
    const cone = floorLamp();
    expect(lampConeRadius(cone, cone.nearDistance)).toBeCloseTo(
      cone.maxRadius * 0.22,
      9,
    );
    expect(lampConeRadius(cone, cone.farDistance)).toBeCloseTo(
      cone.maxRadius,
      9,
    );
    expect(
      lampConeRadius(cone, (cone.nearDistance + cone.farDistance) / 2),
    ).toBeGreaterThan(lampConeRadius(cone, cone.nearDistance));
  });

  it("resolves a world point into axial depth and radial distance", () => {
    const cone = floorLamp();
    const local = lampConeLocal(
      cone,
      at(cone, 0.9, 0.4),
      createLampConeLocal(),
    );

    expect(local.axial).toBeCloseTo(0.9, 9);
    expect(local.radial).toBeCloseTo(0.4, 9);
    expect(local.forward).toBeCloseTo(0.4, 9);
    expect(local.outZ).toBeCloseTo(1, 9);
  });

  it("lets a moth drift well proud of the beam before anything pushes back", () => {
    const cone = floorLamp();
    const out = { x: 0, y: 0, z: 0 };
    const axial = 1;
    const radius = lampConeRadius(cone, axial);

    // Inside the lit cone: nothing at all.
    expect(
      insectLampConeContainment(cone, at(cone, axial, radius * 0.5), out),
    ).toBe(0);
    // At the visible edge: still nothing. This is the behaviour the
    // illumination model was written for and has never been able to show.
    expect(insectLampConeContainment(cone, at(cone, axial, radius), out)).toBe(
      0,
    );
    // Well outside: drawn back, and inward.
    const severity = insectLampConeContainment(
      cone,
      at(cone, axial, lampConeOuterRadius(cone, axial) + 0.05),
      out,
    );
    expect(severity).toBeGreaterThan(0.5);
    expect(out.z).toBeLessThan(0);
  });

  it("darkens as it goes, so leaving the light reads as leaving the light", () => {
    const cone = floorLamp();
    const axial = 1;
    const radius = lampConeRadius(cone, axial);
    const range = cone.farDistance - cone.nearDistance;
    const brightness = (radial: number) =>
      mothIllumination(radial, radius, axial, cone.nearDistance, range, 1);

    expect(brightness(0)).toBeGreaterThan(0.6);
    expect(brightness(radius)).toBeCloseTo(
      (1 - 0.35 * ((axial - cone.nearDistance) / range)) *
        MOTH_ILLUMINATION.floor,
      9,
    );
    expect(brightness(radius * 1.5)).toBeLessThan(brightness(radius));
    expect(brightness(radius * 2.2)).toBe(0);
  });

  it("leans a moth behind the fixture back toward the camera side", () => {
    const cone = floorLamp();
    const out = { x: 0, y: 0, z: 0 };

    expect(insectLampConeResidencyDrift(cone, at(cone, 1, 0.5), out)).toBe(0);
    const strength = insectLampConeResidencyDrift(cone, at(cone, 1, -0.5), out);
    expect(strength).toBeGreaterThan(0);
    expect(out.z).toBeCloseTo(1, 9);
  });

  it("clamps on the overshoot boundary, never on the beam", () => {
    const cone = floorLamp();
    const axial = 1;
    const inside = at(cone, axial, lampConeRadius(cone, axial) * 1.2);
    expect(
      clampToInsectLampCone(cone, inside, { x: 0, y: 0, z: 0 }, 0.05),
    ).toBe(false);

    const far = at(cone, axial, lampConeOuterRadius(cone, axial) + 1);
    const velocity = { x: 0, y: 0, z: 0.6 };
    expect(clampToInsectLampCone(cone, far, velocity, 0.05)).toBe(true);
    const local = lampConeLocal(cone, far, createLampConeLocal());
    expect(local.radial).toBeLessThanOrEqual(
      lampConeOuterRadius(cone, axial) + 0.06,
    );
    // Only the outward component goes; a boundary that eats the whole velocity
    // is a sticky one.
    expect(velocity.z).toBeCloseTo(0, 9);
  });

  it("follows the fixture, because a desk lamp is a prop you can pick up", () => {
    const cone = floorLamp();
    const containment = createInsectLampConeContainment(cone);
    const out = { x: 0, y: 0, z: 0 };
    const point = at(cone, 1, lampConeOuterRadius(cone, 1) + 0.05);
    expect(containment.containment(point, out)).toBeGreaterThan(0.5);

    // Move the lamp onto the moth rather than the moth onto the lamp.
    cone.sourceZ += lampConeOuterRadius(cone, 1) + 0.05;
    expect(containment.containment(point, out)).toBe(0);
  });
});

/** Enough of a world for the Intent Layer to run: no analytic flight (a
 * steering resident must never sample one) and no geometry. */
class BareFlightWorld {
  sampleCruise(): never {
    throw new Error("a steering moth must never sample an analytic flight");
  }
  sweepSphere() {
    return true;
  }
  tryReserve() {
    return true;
  }
  release() {
    /* no reservations are taken here */
  }
}

describe("moths roam by intent", () => {
  const fly = (seconds: number) => {
    const world = new BareFlightWorld();
    const cone = floorLamp();
    const containment = createInsectLampConeContainment(cone);
    const moths = Array.from(
      { length: MOTH_LIGHT_PROFILES.floor.count },
      (_, index) =>
        createInsectPilot({
          occupantId: `moth:${index}`,
          flightId: index,
          seed: 700 + index,
          initialTime: 0,
          initial: {
            position: at(cone, 0.8 + index * 0.04, 0.1),
            velocity: { x: 0.1, y: 0, z: 0 },
            acceleration: { x: 0, y: 0, z: 0 },
          },
          profile: MOTH_PILOT_PROFILE,
          roam: {
            profile: MOTH_STEERING_PROFILE,
            containment,
            volume: null,
            transit: null,
            evade: null,
          },
        }),
    );
    const tracks = moths.map(() => ({
      samples: [] as { x: number; y: number; z: number }[],
      maxRadialRatio: 0,
      framesOutsideBeam: 0,
      framesOutsideOvershoot: 0,
      stalled: 0,
    }));
    const local = createLampConeLocal();
    const frames = seconds * 60;
    for (let frame = 0; frame < frames; frame++)
      for (let index = 0; index < moths.length; index++) {
        const pilot = moths[index]!;
        const track = tracks[index]!;
        advanceInsectPilot(pilot, 1 / 60, world);
        lampConeLocal(cone, pilot.position, local);
        const ratio = local.radial / lampConeRadius(cone, local.axial);
        track.maxRadialRatio = Math.max(track.maxRadialRatio, ratio);
        if (ratio > 1) track.framesOutsideBeam++;
        if (local.radial > lampConeOuterRadius(cone, local.axial) + 0.08)
          track.framesOutsideOvershoot++;
        if (
          Math.hypot(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z) <
          0.05
        )
          track.stalled++;
        if (frame % 12 === 0) track.samples.push({ ...pilot.position });
      }
    return { tracks, frames };
  };

  it("gives every moth its own path, not one of five", () => {
    // `phase = index * TAU * 0.381966` with `variation = index % 5` gave twelve
    // moths five behaviours, each a fixed closed curve for the life of the
    // page (ADR 0007).
    const { tracks } = fly(40);
    let closest = Number.POSITIVE_INFINITY;
    for (let a = 0; a < tracks.length; a++)
      for (let b = a + 1; b < tracks.length; b++) {
        let apart = 0;
        const count = Math.min(
          tracks[a]!.samples.length,
          tracks[b]!.samples.length,
        );
        for (let i = 0; i < count; i++) {
          const p = tracks[a]!.samples[i]!;
          const q = tracks[b]!.samples[i]!;
          apart += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        }
        closest = Math.min(closest, apart / count);
      }
    expect(closest).toBeGreaterThan(0.1);
  });

  it("leaves the beam sometimes, and the cone never", () => {
    const { tracks, frames } = fly(40);
    for (const track of tracks) {
      // The whole point: a moth is no longer mathematically incapable of
      // leaving the light.
      expect(track.maxRadialRatio).toBeGreaterThan(1);
      expect(track.framesOutsideBeam).toBeGreaterThan(0);
      // ...but it does not wander off into the room.
      expect(track.framesOutsideOvershoot).toBe(0);
      // ...and it never stops. A motionless moth is worse than no moth.
      expect(track.stalled / frames).toBeLessThan(0.05);
    }
  });

  it("reaches back past the source, so the fixture itself is inside it", () => {
    // Owner review: "why can't moths go straight up to the light and around
    // the light source itself?" and "how are moths supposed to land when the
    // targets aren't within their cone?" — both were the same boundary. The
    // cone began at the shade mouth, so the lamp, and every Perch mounted on
    // it, sat outside the region a moth was allowed to occupy.
    const cone = createInsectLampCone();
    expect(lampConeAxialMin(cone)).toBeLessThan(0);

    const onAxis = (axial: number) => ({
      x: cone.sourceX + cone.dirX * axial,
      y: cone.sourceY + cone.dirY * axial,
      z: cone.sourceZ + cone.dirZ * axial,
    });
    // Level with the source, and a little behind it: the shade.
    expect(lampConeContainsPoint(cone, onAxis(0))).toBe(true);
    expect(
      lampConeContainsPoint(cone, onAxis(lampConeAxialMin(cone) + 0.02)),
    ).toBe(true);
    // The column around the fixture has real width, or there is nothing to
    // orbit — `lampConeRadius` holds its near value upstream of the mouth.
    const source = onAxis(0);
    expect(lampConeContainsPoint(cone, { ...source, z: source.z + 0.12 })).toBe(
      true,
    );
    // ...and the far side of the boundary is still outside.
    expect(
      lampConeContainsPoint(cone, onAxis(lampConeAxialMin(cone) - 0.05)),
    ).toBe(false);
    expect(lampConeContainsPoint(cone, onAxis(cone.farDistance + 0.05))).toBe(
      false,
    );
  });
});
