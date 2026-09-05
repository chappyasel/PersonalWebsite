import * as THREE from "three";
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
  carFitsFrame,
  chaseAimY,
  chaseDepth,
  chaseFraming,
  chasePose,
  chaseZExtremes,
  nearestChaseDepth,
  nearestVisibleGroundZ,
  projectPoint,
  roadEdgeEntryZ,
  settledCarWidthFraction,
  swingLimit,
} from "./visionRideCamera";
import {
  VISION_RIDE_DRIVING,
  driveChaseDistanceScale,
} from "./visionRideDriving";
import { VISION_RIDE_PARALLAX, swingPath } from "./visionRideParallax";
import {
  VISION_RIDE_MOUNTAIN_HORIZON_METRES,
  VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z,
  VISION_RIDE_ROAD_HALF_WIDTH,
  VISION_RIDE_VALLEY_SPREAD_METRES,
  generateUnifiedLandscape,
  mountainCoverageComplete,
  mountainWindowOffsets,
} from "./visionRideTerrain";
import { VISION_RIDE_ZOOM } from "./visionRideZoom";

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
      expect(last.position).toEqual([
        framing.restX,
        framing.eyeY,
        framing.chaseZ,
      ]);
      expect(last.aim).toEqual([0, framing.lookY, framing.carZ]);
      // Never leaves the road, never dips into the grid, never crosses the
      // car's body, and the eye always ends up further back than it began.
      let previousZ = -Infinity;
      for (let p = 0; p <= 1.0001; p += 0.02) {
        const pose = arrivalPose(framing, p);
        expect(Math.abs(pose.position[0])).toBeLessThan(
          VISION_RIDE_ROAD_HALF_WIDTH,
        );
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
    expect(
      arrivalProgress(VISION_RIDE_ARRIVAL.holdSeconds + 0.3),
    ).toBeGreaterThan(0);
    expect(arrivalProgress(VISION_RIDE_ARRIVAL.holdSeconds + 0.3)).toBeLessThan(
      0.05,
    );
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
    // The farthest-back camera is the portrait chase with the wheel all the
    // way out and the accelerator down; the opening shot starts beside the
    // car, and the pointer and the breathing cycle only ever move the eye
    // toward it.
    const portrait = chaseFraming(true);
    expect(range.max).toBeCloseTo(chaseZExtremes(portrait).farthest, 9);
    expect(range.max).toBeGreaterThan(portrait.chaseZ);
    expect(range.max).toBeLessThan(portrait.chaseZ + 8);
    expect(range.min).toBeLessThan(chaseFraming(false).chaseZ);
    expect(VISION_RIDE_MOUNTAIN_NEAR_COVERAGE_Z).toBeGreaterThanOrEqual(
      range.max + VISION_RIDE_GRID_NEAR_MARGIN_METRES,
    );
    // The bottom edge of either frame lands on floor, with the margin to
    // spare, even with the eye at its lowest parallax offset.
    for (const portrait of [false, true]) {
      const nearestGround = nearestVisibleGroundZ(portrait);
      // Seen from the farthest camera the wheel and the accelerator allow.
      expect(nearestGround).toBeLessThan(
        chaseZExtremes(chaseFraming(portrait)).farthest,
      );
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
        const anchorBelowCentre =
          Math.atan2(eyeY - lookY, cameraZ - carZ) - pitch;
        expect(Math.abs(anchorBelowCentre)).toBeLessThan((2.5 * Math.PI) / 180);
      }
      // Landscape needs the tilt at the crest; portrait's wider field does not.
      const crestZ = chaseZ + chaseOffsetForScale(crestScale, chaseDistance);
      if (portrait)
        expect(chaseAimY(framing, eyeY, crestZ)).toBeCloseTo(lookY, 9);
      else expect(chaseAimY(framing, eyeY, crestZ)).toBeLessThan(lookY - 0.05);
    }
  });

  it("keeps the car's rear in frame with the pointer at its extremes at the crest", () => {
    const cam = VISION_RIDE_CAMERA;
    const range = cameraZRange();
    const rearBumperZ = cam.carZ + cam.carLengthMetres / 2;
    // Over a metre of road between the eye and the bumper at the crest of
    // the breath with the pointer pulling, the brake down and the wheel all
    // the way in.
    expect(range.min - rearBumperZ).toBeGreaterThan(1);
    expect(range.min).toBeCloseTo(
      chaseZExtremes(chaseFraming(false)).nearest,
      9,
    );
    const clearance = (cam.bottomClearanceDegrees * Math.PI) / 180;
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      const halfFov = (framing.fov * Math.PI) / 360;
      const inputScale = portrait ? VISION_RIDE_PARALLAX.portraitInputScale : 1;
      const lift =
        VISION_RIDE_PARALLAX.maxY * inputScale +
        (portrait
          ? VISION_RIDE_PARALLAX.swayY * VISION_RIDE_PARALLAX.portraitSwayScale
          : VISION_RIDE_PARALLAX.swayY);
      const cameraZ = chaseZExtremes(framing).nearest;
      for (const eyeY of [
        framing.eyeY - lift,
        framing.eyeY,
        framing.eyeY + lift,
      ]) {
        const aimY = chaseAimY(framing, eyeY, cameraZ);
        const pitch = Math.atan2(eyeY - aimY, cameraZ - framing.carZ);
        const rearBottom = Math.atan2(
          eyeY - cam.carBottomMetres,
          cameraZ - rearBumperZ,
        );
        expect(rearBottom - pitch).toBeLessThanOrEqual(
          halfFov - clearance + 1e-9,
        );
        // The roof stays inside the top edge too.
        const roof = Math.atan2(eyeY - 1.15, cameraZ - rearBumperZ);
        expect(pitch - roof).toBeLessThan(halfFov);
      }
    }
  });
  it("swings on a parabola to a rear three-quarter view at the wall", () => {
    const cam = VISION_RIDE_CAMERA;
    const { wallX, swingDegrees } = VISION_RIDE_PARALLAX;
    const angle = (swingDegrees * Math.PI) / 180;
    expect(wallX).toBeLessThan(VISION_RIDE_ROAD_HALF_WIDTH);
    for (const anchorDistance of [3.56, 4.44, 7, 9.76, 10.5, 17.1]) {
      expect(swingPath(anchorDistance, 0)).toEqual({
        x: 0,
        zRel: anchorDistance,
      });
      const end = swingPath(anchorDistance, 1);
      expect(end.x).toBeLessThanOrEqual(wallX + 1e-9);
      expect(Math.atan2(end.x, end.zRel)).toBeCloseTo(angle, 9);
      expect(end.zRel).toBeLessThanOrEqual(anchorDistance + 1e-9);
      // Mirror-symmetric, monotone across, on the parabola, walked by
      // angle so the view turns evenly.
      const left = swingPath(anchorDistance, -1);
      expect(left.x).toBeCloseTo(-end.x, 12);
      expect(left.zRel).toBeCloseTo(end.zRel, 12);
      const k = (anchorDistance - end.zRel) / (end.x * end.x);
      for (const s of [0.2, 0.5, 0.8]) {
        const at = swingPath(anchorDistance, s);
        expect(at.zRel).toBeCloseTo(anchorDistance - k * at.x * at.x, 9);
        expect(Math.atan2(at.x, at.zRel)).toBeCloseTo(s * angle, 9);
      }
      let previousX = 0;
      for (let swing = 0.05; swing <= 1.0001; swing += 0.05) {
        const at = swingPath(anchorDistance, swing);
        expect(at.x).toBeGreaterThan(previousX);
        previousX = at.x;
        // The eye keeps clear of the body's near rear corner all along.
        const clearance = Math.hypot(
          Math.max(0, at.x - cam.carHalfWidthMetres),
          Math.max(0, at.zRel - cam.carLengthMetres / 2),
        );
        expect(clearance).toBeGreaterThan(anchorDistance > 4 ? 1 : 0.75);
      }
    }
    // Landscape settled: the wall binds, and the eye pulls forward by the
    // difference to land on the three-quarter view.
    const settled = chaseFraming(false).chaseDistance + cam.carLengthMetres / 2;
    expect(swingPath(settled, 1).x).toBe(wallX);
    expect(settled - swingPath(settled, 1).zRel).toBeCloseTo(
      settled - wallX,
      9,
    );
    expect(swingPath(settled, 3)).toEqual(swingPath(settled, 1));
  });

  it("keeps the eye above the valley's ridge feet all the way to the wall", () => {
    // The wall is set by the measured surface, not the nominal road edge:
    // ridge feet cross the shoulder, so the flank under the eye's lateral
    // extreme must stay below the eye's lowest pass with room to spare.
    const land = generateUnifiedLandscape();
    const halfWidth =
      VISION_RIDE_ROAD_HALF_WIDTH + VISION_RIDE_VALLEY_SPREAD_METRES;
    const height = (row: number, x: number) => {
      const column = Math.floor(x + halfWidth);
      const blend = x + halfWidth - column;
      const at = (c: number) =>
        land.samples[
          (row * (land.columns + 1) + Math.min(land.columns, c)) * 3 + 1
        ]!;
      return at(column) * (1 - blend) + at(column + 1) * blend;
    };
    const lowestEye =
      VISION_RIDE_CAMERA.eyeY -
      VISION_RIDE_PARALLAX.maxY -
      VISION_RIDE_PARALLAX.swayY * VISION_RIDE_PARALLAX.portraitSwayScale -
      0.02;
    let worst = 0;
    for (let row = 0; row <= land.rows; row += 1)
      for (const side of [-1, 1])
        for (let x = 0; x <= VISION_RIDE_PARALLAX.wallX + 0.02; x += 0.1)
          worst = Math.max(worst, height(row, side * x));
    expect(worst).toBeLessThan(lowestEye - 0.4);
    expect(lowestEye).toBeGreaterThan(0.9);
  });

  it("holds the full three-quarter swing on wide frames and caps it exactly elsewhere", () => {
    const cam = VISION_RIDE_CAMERA;
    const crestScale = 1 + VISION_RIDE_BREATH.carGrowth;
    const worst = driveChaseDistanceScale(-1) / VISION_RIDE_ZOOM.reach;
    const far = driveChaseDistanceScale(1) * VISION_RIDE_ZOOM.reach;
    for (const aspect of [
      1128 / 2356,
      9 / 16,
      3 / 4,
      4 / 3,
      16 / 10,
      16 / 9,
      21 / 9,
    ]) {
      const portrait = aspect < 1;
      const framing = chaseFraming(portrait);
      const swayScale = portrait ? VISION_RIDE_PARALLAX.portraitSwayScale : 1;
      const lift =
        VISION_RIDE_PARALLAX.maxY +
        VISION_RIDE_PARALLAX.swayY * swayScale +
        0.018;
      for (const [carScale, distanceScale] of [
        [1, 1],
        [crestScale, 1],
        [crestScale, worst],
        [1, far],
      ] as const) {
        for (const eyeY of [
          framing.eyeY - lift,
          framing.eyeY,
          framing.eyeY + lift,
        ]) {
          for (const carX of [0, VISION_RIDE_DRIVING.steeringOffsetMetres]) {
            // The floor budgets for the steered car, so the cap always has
            // a pose that fits to start from.
            const depth = chaseDepth({
              framing,
              aspect,
              carScale,
              distanceScale,
              carX,
            });
            for (const direction of [-1, 1]) {
              const limit = swingLimit(framing, aspect, {
                depth,
                eyeY,
                carX,
                direction,
              });
              expect(limit).toBeGreaterThanOrEqual(0);
              expect(limit).toBeLessThanOrEqual(1);
              const pose = chasePose(framing, {
                depth,
                swing: direction * limit,
                eyeY,
              });
              expect(Math.abs(pose.position[0])).toBeLessThanOrEqual(
                VISION_RIDE_PARALLAX.wallX + 1e-9,
              );
              // Every corner of the body inside the frame, checked with
              // three's own projection; the pure projector the cap uses
              // has to agree with it.
              const camera = new THREE.PerspectiveCamera(
                framing.fov,
                aspect,
                0.1,
                100,
              );
              camera.position.set(...pose.position);
              camera.lookAt(...pose.aim);
              camera.updateMatrixWorld();
              for (const sx of [-1, 1]) {
                for (const y of [cam.carBottomMetres, cam.carRoofMetres]) {
                  for (const sz of [-1, 1]) {
                    const point: [number, number, number] = [
                      carX + sx * cam.carHalfWidthMetres,
                      y,
                      cam.carZ + (sz * cam.carLengthMetres) / 2,
                    ];
                    const ndc = new THREE.Vector3(...point).project(camera);
                    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
                    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
                    const own = projectPoint(
                      pose.position,
                      pose.aim,
                      framing.fov,
                      aspect,
                      point,
                    );
                    expect(own.x).toBeCloseTo(ndc.x, 6);
                    expect(own.y).toBeCloseTo(ndc.y, 6);
                  }
                }
              }
              // Exact: a little more swing would push a corner out.
              if (limit < 1) {
                const beyond = chasePose(framing, {
                  depth,
                  swing: direction * Math.min(1, limit + 0.02),
                  eyeY,
                });
                expect(carFitsFrame(beyond, framing.fov, aspect, carX)).toBe(
                  false,
                );
              }
            }
          }
        }
      }
      // Settled, mid eye: 16:9 and wider hold the whole three-quarter
      // view; a phone's portrait frame gives some of it up.
      const settled = chaseDepth({
        framing,
        aspect,
        carScale: 1,
        distanceScale: 1,
      });
      const limit = swingLimit(framing, aspect, {
        depth: settled,
        eyeY: framing.eyeY,
      });
      if (aspect >= 16 / 9) expect(limit).toBe(1);
      // Walked by angle, a phone holds about a seventh of the end angle
      // at the settle before the body reaches its edges.
      if (aspect < 0.5) expect(limit).toBeLessThan(1);
      if (aspect < 0.5) expect(limit).toBeGreaterThan(0.2);
    }
  });

  it("composes the depth so breath, zoom and lean stay proportional", () => {
    for (const portrait of [false, true]) {
      const framing = chaseFraming(portrait);
      const aspect = portrait ? 9 / 16 : 16 / 9;
      const at = (carScale: number, distanceScale: number) =>
        chaseDepth({ framing, aspect, carScale, distanceScale });
      // Neutral is exactly the settled chase, and the breath alone is the
      // same closure the earlier offset form produced.
      expect(at(1, 1)).toBe(framing.chaseDistance);
      expect(at(2.25, 1)).toBeCloseTo(
        framing.chaseDistance +
          chaseOffsetForScale(2.25, framing.chaseDistance),
        12,
      );
      // Zoom and lean scale the result wherever the breath sits.
      expect(at(1, 1.6)).toBeCloseTo(framing.chaseDistance * 1.6, 12);
      expect(at(2.25, 0.8) / at(2.25, 1)).toBeCloseTo(0.8, 12);
      // The frame's floor binds only when the stack would push the fenders
      // out; on a wide frame it never does.
      expect(nearestChaseDepth(framing, 32 / 9)).toBeLessThan(
        chaseZExtremes(framing).nearest - (framing.carZ + 2.4),
      );
      expect(at(2.25, 0.01)).toBe(nearestChaseDepth(framing, aspect));
    }
    // Landscape at the crest with the brake down and the wheel all the way
    // in binds on 16:9 and 4:3 alike now that the wheel reaches 1.6x; on an
    // ultra-wide frame the wheel and the brake keep their full travel.
    const landscape = chaseFraming(false);
    const crest = (aspect: number) =>
      chaseDepth({
        framing: landscape,
        aspect,
        carScale: 2.25,
        distanceScale: driveChaseDistanceScale(-1) / VISION_RIDE_ZOOM.reach,
      });
    expect(crest(32 / 9)).toBeGreaterThan(nearestChaseDepth(landscape, 32 / 9));
    expect(crest(16 / 9)).toBe(nearestChaseDepth(landscape, 16 / 9));
    expect(crest(4 / 3)).toBe(nearestChaseDepth(landscape, 4 / 3));
  });

  it("caps the swing at zero when the frame cannot hold the body at all", () => {
    const framing = chaseFraming(true);
    expect(swingLimit(framing, 0.2, { depth: 0.5, eyeY: framing.eyeY })).toBe(
      0,
    );
    for (const aspect of [0.5, 1, 1.78]) {
      for (const depth of [1, 4.6, 12]) {
        const limit = swingLimit(framing, aspect, {
          depth,
          eyeY: framing.eyeY,
        });
        expect(limit).toBeGreaterThanOrEqual(0);
        expect(limit).toBeLessThanOrEqual(1);
        expect(Number.isFinite(limit)).toBe(true);
      }
    }
  });
});
