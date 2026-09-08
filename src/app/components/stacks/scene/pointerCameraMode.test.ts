import { afterEach, describe, expect, it } from "vitest";

import {
  POINTER_CAMERA_MODE_DEFAULT,
  POINTER_CAMERA_PRESETS,
  POINTER_CAMERA_VALUE_LIMITS,
  createPointerCameraModeController,
  pointerCameraPresetForValues,
} from "./pointerCameraMode";
import {
  POINTER_CAMERA_TILT_MAX_DEGREES,
  POINTER_CAMERA_YAW_MAX_DEGREES,
} from "./pointerCameraTilt";

describe("pointer camera mode", () => {
  it("ships as the orbit preset, and the presets are what they say", () => {
    expect(POINTER_CAMERA_MODE_DEFAULT.preset).toBe("orbit");
    expect(POINTER_CAMERA_PRESETS.orbit).toEqual({
      truck: 1,
      orbitPitch: POINTER_CAMERA_TILT_MAX_DEGREES,
      orbitYaw: POINTER_CAMERA_YAW_MAX_DEGREES,
      headPitch: 0,
      headYaw: 0,
    });
    // The parallax the site shipped with: the eye lifts, nothing turns.
    expect(POINTER_CAMERA_PRESETS.parallax).toEqual({
      truck: 1,
      orbitPitch: 0,
      orbitYaw: 0,
      headPitch: 0,
      headYaw: 0,
    });
    // Head only: the eye never moves for the pointer.
    expect(POINTER_CAMERA_PRESETS.head.truck).toBe(0);
    expect(POINTER_CAMERA_PRESETS.head.orbitPitch).toBe(0);
    expect(POINTER_CAMERA_PRESETS.head.orbitYaw).toBe(0);
    expect(POINTER_CAMERA_PRESETS.head.headPitch).toBe(
      POINTER_CAMERA_TILT_MAX_DEGREES,
    );
    expect(POINTER_CAMERA_PRESETS.head.headYaw).toBe(
      POINTER_CAMERA_YAW_MAX_DEGREES,
    );
    for (const preset of ["parallax", "orbit", "head"] as const) {
      expect(pointerCameraPresetForValues(POINTER_CAMERA_PRESETS[preset])).toBe(
        preset,
      );
    }
    expect(
      pointerCameraPresetForValues({
        ...POINTER_CAMERA_PRESETS.orbit,
        orbitYaw: 1,
      }),
    ).toBe("custom");
  });

  describe("controller", () => {
    const controller = createPointerCameraModeController();

    afterEach(() => controller.reset());

    it("restores a preset's values and forks a dial into custom", () => {
      controller.setPreset("head");
      expect(controller.getSnapshot()).toEqual({
        preset: "head",
        ...POINTER_CAMERA_PRESETS.head,
      });
      controller.setValue("headYaw", 5);
      expect(controller.getSnapshot().preset).toBe("custom");
      expect(controller.getSnapshot().headYaw).toBe(5);
      // Custom keeps what the dials say; a dial that lands back on a preset
      // names it again.
      controller.setPreset("custom");
      expect(controller.getSnapshot().headYaw).toBe(5);
      controller.setValue("headYaw", POINTER_CAMERA_YAW_MAX_DEGREES);
      expect(controller.getSnapshot().preset).toBe("head");
    });

    it("clamps dials to their limits and ignores non-numbers", () => {
      controller.setValue("truck", 4);
      expect(controller.getSnapshot().truck).toBe(
        POINTER_CAMERA_VALUE_LIMITS.truck.max,
      );
      controller.setValue("orbitPitch", -3);
      expect(controller.getSnapshot().orbitPitch).toBe(
        POINTER_CAMERA_VALUE_LIMITS.orbitPitch.min,
      );
      controller.setValue("orbitYaw", Number.NaN);
      expect(controller.getSnapshot().orbitYaw).toBe(
        POINTER_CAMERA_PRESETS.orbit.orbitYaw,
      );
    });

    it("notifies only on a change and resets to the shipped preset", () => {
      let calls = 0;
      const unsubscribe = controller.subscribe(() => {
        calls += 1;
      });
      controller.setPreset("orbit");
      expect(calls).toBe(0);
      controller.setPreset("parallax");
      expect(calls).toBe(1);
      controller.reset();
      expect(controller.getSnapshot()).toEqual(POINTER_CAMERA_MODE_DEFAULT);
      unsubscribe();
    });
  });
});
