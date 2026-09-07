import { afterEach, describe, expect, it } from "vitest";

import {
  POINTER_CAMERA_TILT_MAX_DEGREES,
  createPointerCameraTiltController,
  eyeYForTiltAroundTarget,
  pointerCameraTiltDegrees,
} from "./pointerCameraTilt";

describe("pointer camera tilt", () => {
  it("maps the top and bottom of the viewport to one degree", () => {
    expect(pointerCameraTiltDegrees(1)).toBe(
      POINTER_CAMERA_TILT_MAX_DEGREES,
    );
    expect(pointerCameraTiltDegrees(-1)).toBe(
      -POINTER_CAMERA_TILT_MAX_DEGREES,
    );
    expect(pointerCameraTiltDegrees(0)).toBe(0);
    expect(pointerCameraTiltDegrees(4)).toBe(
      POINTER_CAMERA_TILT_MAX_DEGREES,
    );
    expect(pointerCameraTiltDegrees(Number.NaN)).toBe(0);
  });

  it("raises the eye while keeping the shelf target fixed", () => {
    const eyeY = 0.25;
    const lookY = -0.08;
    const horizontalDistance = 6;
    const tiltRadians = Math.PI / 180;
    const raisedEyeY = eyeYForTiltAroundTarget({
      eyeY,
      lookY,
      horizontalDistance,
      tiltRadians,
    });

    expect(raisedEyeY).toBeGreaterThan(eyeY);
    expect(
      Math.atan2(lookY - raisedEyeY, horizontalDistance),
    ).toBeCloseTo(
      Math.atan2(lookY - eyeY, horizontalDistance) - tiltRadians,
    );
  });

  describe("diagnostics controller", () => {
    const controller = createPointerCameraTiltController();

    afterEach(() => controller.reset());

    it("is enabled by default and can be disabled for the current mount", () => {
      expect(controller.getSnapshot().enabled).toBe(true);
      controller.setEnabled(false);
      expect(controller.getSnapshot().enabled).toBe(false);
      controller.reset();
      expect(controller.getSnapshot().enabled).toBe(true);
    });
  });
});
