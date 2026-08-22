import { DepthOfFieldEffect } from "postprocessing";
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import {
  GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE,
  SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
  SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
  applyShelfDepthOfFieldTuning,
  installShelfDepthOfFieldFocusBand,
  resolveShelfDepthOfFieldTuning,
  shelfDepthOfFieldBlurAmount,
} from "./shelfDepthOfField";
import { SHELF_PLANKS } from "./shelfGeometry";
import {
  ABOUT_STOP_MAX_SHIFT,
  CAMERA,
  depthOfFieldTargetForUnit,
  unitPose,
} from "./worldLayout";

const distance = (
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) => Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

describe("shelf depth-of-field focus band", () => {
  it("holds zero blur through the shelf before beginning the background ramp", () => {
    expect(shelfDepthOfFieldBlurAmount(0)).toBe(0);
    expect(shelfDepthOfFieldBlurAmount(SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS)).toBe(
      0,
    );
    expect(
      shelfDepthOfFieldBlurAmount(SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS + 0.01),
    ).toBeGreaterThan(0);
    expect(
      shelfDepthOfFieldBlurAmount(
        SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS + SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
      ),
    ).toBe(1);
  });

  it("covers every physical plank corner at each authored shelf angle", () => {
    let largestDistanceDelta = 0;

    for (let unit = 0; unit < 7; unit += 1) {
      const pose = unitPose(unit);
      const focusTarget = depthOfFieldTargetForUnit(unit);
      // About can shift two units right to clear the desktop rail. Test both
      // extremes because the DoF surface is radial around the live camera.
      const cameraShifts = unit === 0 ? [0, ABOUT_STOP_MAX_SHIFT] : [0];
      for (const cameraShift of cameraShifts) {
        const camera = [
          pose.position[0] + cameraShift,
          CAMERA.y,
          pose.position[2] + CAMERA.z,
        ] as const;
        const focusDistance = distance(camera, focusTarget);
        const cosine = Math.cos(pose.rotation[1]);
        const sine = Math.sin(pose.rotation[1]);

        for (const plank of SHELF_PLANKS) {
          for (const localX of [-plank.width / 2, plank.width / 2]) {
            for (const localY of [
              plank.centerY - plank.thickness / 2,
              plank.centerY + plank.thickness / 2,
            ]) {
              for (const localZ of [
                plank.centerZ - plank.depth / 2,
                plank.centerZ + plank.depth / 2,
              ]) {
                const corner = [
                  pose.position[0] + localX * cosine + localZ * sine,
                  localY,
                  pose.position[2] - localX * sine + localZ * cosine,
                ] as const;
                largestDistanceDelta = Math.max(
                  largestDistanceDelta,
                  Math.abs(distance(camera, corner) - focusDistance),
                );
              }
            }
          }
        }
      }
    }

    expect(largestDistanceDelta).toBeLessThan(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS,
    );
    expect(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS - largestDistanceDelta,
    ).toBeGreaterThan(0.15);
  });

  it("patches the real circle-of-confusion material exactly once", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    installShelfDepthOfFieldFocusBand(effect);
    const once = effect.cocMaterial.fragmentShader;
    installShelfDepthOfFieldFocusBand(effect);

    expect(effect.cocMaterial.fragmentShader).toBe(once);
    expect(once).toContain(
      "max(0.0, abs(signedDistance) - SHELF_FOCUS_CLEAR_RADIUS)",
    );
    expect(effect.cocMaterial.defines.SHELF_FOCUS_CLEAR_RADIUS).toBe(
      SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS.toFixed(6),
    );
    effect.dispose();
  });
});

const CINEMATIC_DOF = {
  depthOfField: true,
  depthOfFieldBokehScale: 2.4,
  depthOfFieldResolutionScale: 0.75,
} as const;

describe("shelf depth-of-field tuning", () => {
  it("follows the active shelf into world space", () => {
    for (const unit of [0, 3, 6]) {
      expect(
        resolveShelfDepthOfFieldTuning({
          plan: CINEMATIC_DOF,
          activeUnit: unit,
          golfFocused: false,
          seated: false,
        })?.target,
      ).toEqual([...depthOfFieldTargetForUnit(unit)]);
    }
  });

  it("carries the plan's bokeh and resolution scales through unchanged", () => {
    expect(
      resolveShelfDepthOfFieldTuning({
        plan: CINEMATIC_DOF,
        activeUnit: 0,
        golfFocused: false,
        seated: false,
      }),
    ).toMatchObject({
      bokehScale: CINEMATIC_DOF.depthOfFieldBokehScale,
      resolutionScale: CINEMATIC_DOF.depthOfFieldResolutionScale,
      focusRange: SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
    });
  });

  it("widens the accepted range for a golf shot without moving the plane", () => {
    const shelf = resolveShelfDepthOfFieldTuning({
      plan: CINEMATIC_DOF,
      activeUnit: 4,
      golfFocused: false,
      seated: false,
    });
    const golf = resolveShelfDepthOfFieldTuning({
      plan: CINEMATIC_DOF,
      activeUnit: 4,
      golfFocused: true,
      seated: false,
    });

    expect(golf?.focusRange).toBe(GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE);
    expect(golf?.focusRange).toBeGreaterThan(shelf!.focusRange);
    // The focal PLANE never racks during a shot; only the accepted band moves.
    expect(golf?.target).toEqual(shelf?.target);
  });

  it.each([
    ["the plan drops the pass", { ...CINEMATIC_DOF, depthOfField: false }, {}],
    ["the camera is seated", CINEMATIC_DOF, { seated: true }],
    ["?nodof isolates it", CINEMATIC_DOF, { isolated: true }],
  ])("mounts nothing when %s", (_reason, plan, overrides) => {
    expect(
      resolveShelfDepthOfFieldTuning({
        plan,
        activeUnit: 0,
        golfFocused: false,
        seated: false,
        ...overrides,
      }),
    ).toBeNull();
  });

  it("pushes live tuning onto both resolution owners of a mounted effect", () => {
    const effect = new DepthOfFieldEffect(new PerspectiveCamera());

    applyShelfDepthOfFieldTuning(effect, {
      focusRange: 3.5,
      bokehScale: 2.4,
      resolutionScale: 0.6,
    });

    expect(effect.bokehScale).toBe(2.4);
    expect(effect.cocMaterial.focusRange).toBe(3.5);
    expect(effect.resolution.scale).toBe(0.6);
    // The blur pass owns a second copy of the scale and is the one that gets
    // forgotten; a mismatch there renders the bokeh at the wrong size.
    expect(effect.blurPass.resolution.scale).toBe(0.6);
    // Live tuning must not lose the clear band the shelf depends on.
    expect(effect.cocMaterial.fragmentShader).toContain(
      "SHELF_FOCUS_CLEAR_RADIUS",
    );
    effect.dispose();
  });
});
