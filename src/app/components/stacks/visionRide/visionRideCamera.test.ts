import { describe, expect, it } from "vitest";

import { VISION_RIDE_BREATH, chaseOffsetForScale } from "./visionRideBreath";
import {
  VISION_RIDE_ARRIVAL,
  VISION_RIDE_CAMERA,
  VISION_RIDE_GRID_CELL_METRES,
  VISION_RIDE_GRID_HORIZON_METRES,
  VISION_RIDE_GRID_NEAR_MARGIN_METRES,
  VISION_RIDE_INTRO_SECONDS,
  arrivalPose,
  arrivalProgress,
  bottomColumnSpacingPx,
  bottomRowSpacingPx,
  cameraZRange,
  chaseAimY,
  chaseFraming,
  nearestVisibleGroundZ,
  roadEdgeEntryZ,
  settledCarWidthFraction,
} from "./visionRideCamera";
import { VISION_RIDE_PARALLAX } from "./visionRideParallax";
import {
  VISION_RIDE_MOUNTAIN_HORIZON_METRES,
  VISION_RIDE_ROAD_HALF_WIDTH,
  VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z,
  mountainCoverageComplete,
  mountainWindowOffsets,
} from "./visionRideTerrain";

describe("Vision ride chase framing", () => {
  it("settles on the centre line so sun, vanishing point and car align", () => {
    expect(VISION_RIDE_CAMERA.restX).toBe(0);
    expect(chaseFraming(false).restX).toBe(0);
    expect(chaseFraming(true).restX).toBe(0);
  });

  it("opens on the left rear wheel and pulls back to the settled chase", () => {
    const cam = VISION_RIDE_CAMERA;
    const wheel = [-0.84, 0.36, cam.carZ + cam.carRearAxleMetres] as const;
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      const first = arrivalPose(framing, 0);
      // Within a couple of metres of the wheel, outside the body, low.
      const toWheel = Math.hypot(
        first.position[0] - wheel[0],
        first.position[1] - wheel[1],
        first.position[2] - wheel[2],
      );
      expect(toWheel).toBeLessThan(1.6);
      expect(first.position[0]).toBeLessThan(-1.2);
      expect(first.position[1]).toBeLessThan(1);
      expect(first.position[1]).toBeGreaterThan(0.3);
      // Looking at the car: the aim lands inside the body's footprint.
      expect(Math.abs(first.aim[0])).toBeLessThan(1.1);
      expect(first.aim[2]).toBeGreaterThan(cam.carZ - cam.carLengthMetres / 2);
      expect(first.aim[2]).toBeLessThan(cam.carZ + cam.carLengthMetres / 2);
      // Lands exactly on the settled chase pose and aim.
      const last = arrivalPose(framing, 1);
      expect(last.position).toEqual([framing.restX, framing.eyeY, framing.chaseZ]);
      expect(last.aim).toEqual([0, framing.lookY, framing.carZ]);
      // Never leaves the road, never dips into the grid, never crosses the
      // car's body, and the eye always ends up further back than it began.
      let previousZ = -Infinity;
      for (let p = 0; p <= 1.0001; p += 0.02) {
        const pose = arrivalPose(framing, p);
        expect(Math.abs(pose.position[0])).toBeLessThan(VISION_RIDE_ROAD_HALF_WIDTH);
        expect(pose.position[1]).toBeGreaterThan(0.3);
        const insideBody =
          Math.abs(pose.position[0]) < 1.2 &&
          Math.abs(pose.position[2] - cam.carZ) < cam.carLengthMetres / 2 + 0.3;
        expect(insideBody).toBe(false);
        expect(pose.position[2]).toBeGreaterThanOrEqual(previousZ - 1e-9);
        previousZ = pose.position[2];
      }
    }
    // The hold covers the switch-on, then the pull eases in and out.
    expect(arrivalProgress(0)).toBe(0);
    expect(arrivalProgress(VISION_RIDE_ARRIVAL.holdSeconds)).toBe(0);
    expect(arrivalProgress(VISION_RIDE_ARRIVAL.holdSeconds + 0.3)).toBeGreaterThan(0);
    expect(arrivalProgress(VISION_RIDE_ARRIVAL.holdSeconds + 0.3)).toBeLessThan(0.05);
    expect(arrivalProgress(VISION_RIDE_INTRO_SECONDS)).toBe(1);
    expect(arrivalProgress(99)).toBe(1);
  });

  it("lands the portrait car about fifty percent closer, centred", () => {
    // The pass-one capture (1128x2356) put the car at ~38 % of the width at
    // the landscape chase distance. Portrait pulls back on a wider field.
    for (const aspect of [1128 / 2356, 9 / 19.5, 9 / 16]) {
      const fraction = settledCarWidthFraction(aspect);
      expect(fraction).toBeGreaterThan(0.28);
      expect(fraction).toBeLessThan(0.37);
    }
    // A 3:4 tablet is wider still; the car stays a distant, centred chase.
    expect(settledCarWidthFraction(3 / 4)).toBeGreaterThan(0.2);
    expect(settledCarWidthFraction(3 / 4)).toBeLessThan(0.24);
    expect(settledCarWidthFraction(1128 / 2356)).toBeGreaterThan(0.33);
    expect(settledCarWidthFraction(1128 / 2356)).toBeLessThan(0.35);
    const portrait = chaseFraming(true);
    expect(portrait.chaseZ).toBeGreaterThan(chaseFraming(false).chaseZ);
    expect(portrait.fov).toBeGreaterThan(chaseFraming(false).fov);
  });

  it("moves the landscape car fifty percent closer without filling the road", () => {
    const fraction = settledCarWidthFraction(16 / 9);
    expect(fraction).toBeGreaterThan(0.17);
    expect(fraction).toBeLessThan(0.21);
  });

  it("keeps the floor behind every camera position and out to the horizon", () => {
    const range = cameraZRange();
    // The farthest-back camera is the settled portrait chase; the opening
    // shot starts beside the car and nothing the pointer or the breathing
    // cycle does moves the camera further back than that.
    expect(range.max).toBe(chaseFraming(true).chaseZ);
    expect(range.min).toBeLessThan(chaseFraming(false).chaseZ);
    expect(VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z).toBeGreaterThanOrEqual(
      range.max + VISION_RIDE_GRID_NEAR_MARGIN_METRES,
    );
    // The bottom edge of either frame lands on floor, with the margin to
    // spare, even with the eye at its lowest parallax offset.
    for (const portrait of [false, true]) {
      const nearestGround = nearestVisibleGroundZ(portrait);
      expect(nearestGround).toBeLessThan(chaseFraming(portrait).chaseZ);
      expect(
        VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z - nearestGround,
      ).toBeGreaterThan(VISION_RIDE_GRID_NEAR_MARGIN_METRES);
    }
    expect(VISION_RIDE_MOUNTAIN_HORIZON_METRES).toBeGreaterThanOrEqual(
      VISION_RIDE_GRID_HORIZON_METRES,
    );
  });

  it("covers the flanks from where the road edge enters any frame", () => {
    // From the farthest-back camera with the pointer at its lateral
    // extreme, the foot of the flank enters the frame at this z. The
    // mountain window must already be covering there, at every travel
    // phase, on phones through ultra-wide desktops.
    for (const [portrait, aspects] of [
      [true, [1128 / 2356, 9 / 19.5, 9 / 16, 3 / 4]],
      [false, [4 / 3, 16 / 10, 16 / 9, 21 / 9, 32 / 9]],
    ] as const) {
      for (const aspect of aspects) {
        expect(roadEdgeEntryZ(portrait, aspect)).toBeLessThan(
          VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z,
        );
      }
    }
    for (const travel of [0, 0.1, 39.9, 40, 80.1, 119.9, 120, 245.7]) {
      const [near] = mountainWindowOffsets(travel);
      expect(near).toBeGreaterThanOrEqual(VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z);
      // Forward coverage still reaches the end of the fill dissolve.
      expect(
        mountainCoverageComplete(travel, VISION_RIDE_MOUNTAIN_HORIZON_METRES),
      ).toBe(true);
    }
  });

  it("uses the reference's broad metre-scale grid", () => {
    const landscape = bottomColumnSpacingPx(1440, 900);
    expect(landscape).toBeGreaterThan(300);
    expect(landscape).toBeLessThan(340);
    // Scales with the frame, so the figure holds at any DPR.
    expect(bottomColumnSpacingPx(2880, 1800)).toBeCloseTo(landscape * 2, 6);
    // Portrait's bottom edge is closer to the floor. The broad grid still
    // leaves more than one complete foreground cell in frame.
    const portrait = bottomColumnSpacingPx(1128, 2356);
    expect(portrait).toBeLessThan(1128 / 1.2);
    expect(portrait).toBeGreaterThan(300);
    expect(VISION_RIDE_GRID_CELL_METRES).toBeGreaterThanOrEqual(0.95);
    expect(VISION_RIDE_GRID_CELL_METRES).toBeLessThanOrEqual(1.05);
  });

  it("keeps the broad foreground rows legible", () => {
    const landscape = bottomRowSpacingPx(1440, 900);
    expect(landscape).toBeGreaterThan(120);
    expect(landscape).toBeLessThan(220);
    expect(bottomRowSpacingPx(2880, 1800)).toBeCloseTo(landscape * 2, 6);
    const portrait = bottomRowSpacingPx(1128, 2356);
    expect(portrait).toBeGreaterThan(240);
  });

  it("looks down at the road from a raised eye, car still centred", () => {
    expect(VISION_RIDE_CAMERA.eyeY).toBeGreaterThanOrEqual(1.5);
    expect(VISION_RIDE_CAMERA.eyeY).toBeLessThanOrEqual(1.8);
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      expect(framing.eyeY).toBeGreaterThan(framing.lookY);
      const distance = framing.chaseZ - framing.carZ;
      const downDegrees =
        (Math.atan2(framing.eyeY - framing.lookY, distance) * 180) / Math.PI;
      // Enough tilt for the grid to read top-down, not so much that the
      // horizon drops below the frame's upper third.
      expect(downDegrees).toBeGreaterThan(2);
      expect(downDegrees).toBeLessThan(6);
      const horizonFromTop = 0.5 - (downDegrees / (framing.fov / 2)) * 0.5;
      expect(horizonFromTop).toBeGreaterThan(0.33);
      expect(horizonFromTop).toBeLessThan(0.5);
      // The aim is the car, so the raised eye never moves it off centre.
      expect(framing.restX).toBe(0);
    }
  });

  it("keeps the car centred as it grows and tilts only to keep its rear in frame", () => {
    const cam = VISION_RIDE_CAMERA;
    const crestScale = 1 + VISION_RIDE_BREATH.carGrowth;
    const clearance = (cam.bottomClearanceDegrees * Math.PI) / 180;
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      const { eyeY, lookY, carZ, chaseZ, chaseDistance } = framing;
      const halfFov = (framing.fov * Math.PI) / 360;
      // The distance the breath scales is to the rear face the viewer sees,
      // not the anchor at the car's middle.
      expect(chaseDistance).toBeCloseTo(
        chaseZ - carZ - cam.carLengthMetres / 2,
        9,
      );
      // Settled, the aim is the car's mid-height: no tilt.
      expect(chaseAimY(framing, eyeY, chaseZ)).toBeCloseTo(lookY, 9);
      const settledPitch = Math.atan2(eyeY - lookY, chaseZ - carZ);
      for (let phase = 0; phase <= 1.0001; phase += 0.05) {
        const scale = 1 + VISION_RIDE_BREATH.carGrowth * phase;
        const cameraZ = chaseZ + chaseOffsetForScale(scale, chaseDistance);
        const aimY = chaseAimY(framing, eyeY, cameraZ);
        const pitch = Math.atan2(eyeY - aimY, cameraZ - carZ);
        // The aim never rises above the car: the camera only ever tilts
        // further down, never up, and never past a sane crest tilt.
        expect(aimY).toBeLessThanOrEqual(lookY + 1e-9);
        expect(pitch - settledPitch).toBeLessThan((7 * Math.PI) / 180);
        // The car's lowest rear point keeps its clearance from the bottom edge.
        const rearBottom = Math.atan2(
          eyeY - cam.carBottomMetres,
          cameraZ - (carZ + cam.carLengthMetres / 2),
        );
        expect(rearBottom - pitch).toBeLessThanOrEqual(
          halfFov - clearance + 1e-9,
        );
        // And the car's anchor stays within a couple of degrees of centre,
        // so the swell reads as growth in place rather than a slide.
        const anchorBelowCentre = Math.atan2(eyeY - lookY, cameraZ - carZ) - pitch;
        expect(Math.abs(anchorBelowCentre)).toBeLessThan((2.5 * Math.PI) / 180);
      }
      // Landscape needs the tilt at the crest; portrait's wider field does not.
      const crestZ = chaseZ + chaseOffsetForScale(crestScale, chaseDistance);
      if (portrait) expect(chaseAimY(framing, eyeY, crestZ)).toBeCloseTo(lookY, 9);
      else expect(chaseAimY(framing, eyeY, crestZ)).toBeLessThan(lookY - 0.05);
    }
  });

  it("keeps the car's rear in frame with the pointer at its extremes at the crest", () => {
    const cam = VISION_RIDE_CAMERA;
    const range = cameraZRange();
    const rearBumperZ = cam.carZ + cam.carLengthMetres / 2;
    // Over a metre of road between the eye and the bumper at the crest of
    // the breath with the pointer pulling the camera to its nearest.
    expect(range.min - rearBumperZ).toBeGreaterThan(1);
    const clearance = (cam.bottomClearanceDegrees * Math.PI) / 180;
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      const halfFov = (framing.fov * Math.PI) / 360;
      const lift = VISION_RIDE_PARALLAX.maxY * (portrait ? VISION_RIDE_PARALLAX.portraitScale : 1);
      const cameraZ =
        framing.chaseZ +
        chaseOffsetForScale(1 + VISION_RIDE_BREATH.carGrowth, framing.chaseDistance) -
        VISION_RIDE_PARALLAX.convexZ;
      for (const eyeY of [framing.eyeY - lift, framing.eyeY, framing.eyeY + lift]) {
        const aimY = chaseAimY(framing, eyeY, cameraZ);
        const pitch = Math.atan2(eyeY - aimY, cameraZ - framing.carZ);
        const rearBottom = Math.atan2(eyeY - cam.carBottomMetres, cameraZ - rearBumperZ);
        expect(rearBottom - pitch).toBeLessThanOrEqual(halfFov - clearance + 1e-9);
        // The roof stays inside the top edge too.
        const roof = Math.atan2(eyeY - 1.15, cameraZ - rearBumperZ);
        expect(pitch - roof).toBeLessThan(halfFov);
      }
    }
  });
});
