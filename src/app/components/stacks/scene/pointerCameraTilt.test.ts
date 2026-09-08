import { afterEach, describe, expect, it } from "vitest";

import {
  POINTER_CAMERA_TILT_MAX_DEGREES,
  POINTER_CAMERA_YAW_MAX_DEGREES,
  aimForHeadTurn,
  createPointerCameraTiltController,
  eyeXZForYawAroundTarget,
  eyeYForTiltAroundTarget,
  pointerCameraTiltDegrees,
  pointerCameraYawDegrees,
} from "./pointerCameraTilt";

describe("pointer camera tilt", () => {
  it("maps the top and bottom of the viewport to two degrees", () => {
    expect(POINTER_CAMERA_TILT_MAX_DEGREES).toBe(2);
    expect(pointerCameraTiltDegrees(1)).toBe(POINTER_CAMERA_TILT_MAX_DEGREES);
    expect(pointerCameraTiltDegrees(-1)).toBe(-POINTER_CAMERA_TILT_MAX_DEGREES);
    expect(pointerCameraTiltDegrees(0)).toBe(0);
    expect(pointerCameraTiltDegrees(4)).toBe(POINTER_CAMERA_TILT_MAX_DEGREES);
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
    expect(Math.atan2(lookY - raisedEyeY, horizontalDistance)).toBeCloseTo(
      Math.atan2(lookY - eyeY, horizontalDistance) - tiltRadians,
    );
  });

  it("maps each side of the parallax centre to three degrees of yaw", () => {
    expect(POINTER_CAMERA_YAW_MAX_DEGREES).toBe(3);
    expect(pointerCameraYawDegrees(1)).toBe(POINTER_CAMERA_YAW_MAX_DEGREES);
    expect(pointerCameraYawDegrees(-1)).toBe(-POINTER_CAMERA_YAW_MAX_DEGREES);
    expect(pointerCameraYawDegrees(0)).toBe(0);
    expect(pointerCameraYawDegrees(3)).toBe(POINTER_CAMERA_YAW_MAX_DEGREES);
    expect(pointerCameraYawDegrees(Number.NaN)).toBe(0);
    // A dock-side neutral: rest at the gap centre, full swing at each edge,
    // and the shorter run to the right edge reaches its swing sooner.
    expect(pointerCameraYawDegrees(0.3, 0.3)).toBe(0);
    expect(pointerCameraYawDegrees(1, 0.3)).toBe(
      POINTER_CAMERA_YAW_MAX_DEGREES,
    );
    expect(pointerCameraYawDegrees(-1, 0.3)).toBe(
      -POINTER_CAMERA_YAW_MAX_DEGREES,
    );
    expect(pointerCameraYawDegrees(0.65, 0.3)).toBeCloseTo(
      POINTER_CAMERA_YAW_MAX_DEGREES / 2,
      10,
    );
    expect(pointerCameraYawDegrees(-0.35, 0.3)).toBeCloseTo(
      -POINTER_CAMERA_YAW_MAX_DEGREES / 2,
      10,
    );
  });

  it("turns the view right by stepping the eye left around the look target", () => {
    const eyeX = 0.8;
    const eyeZ = 5.7;
    const lookX = 0.9;
    const lookZ = -0.2;
    const yawRadians = (2 * Math.PI) / 180;
    const orbited = eyeXZForYawAroundTarget({
      eyeX,
      eyeZ,
      lookX,
      lookZ,
      yawRadians,
    });

    expect(orbited.x).toBeLessThan(eyeX);
    expect(orbited.z).toBeLessThan(eyeZ);
    expect(Math.hypot(orbited.x - lookX, orbited.z - lookZ)).toBeCloseTo(
      Math.hypot(eyeX - lookX, eyeZ - lookZ),
      10,
    );
    // The forward vector (target minus eye) swings right by the yaw.
    const before = Math.atan2(lookX - eyeX, -(lookZ - eyeZ));
    const after = Math.atan2(lookX - orbited.x, -(lookZ - orbited.z));
    expect(after - before).toBeCloseTo(yawRadians, 10);
    expect(
      eyeXZForYawAroundTarget({ eyeX, eyeZ, lookX, lookZ, yawRadians: 0 }),
    ).toEqual({ x: eyeX, z: eyeZ });
  });

  it("takes a custom maximum for either mapping", () => {
    expect(pointerCameraTiltDegrees(1, 0)).toBe(0);
    expect(pointerCameraTiltDegrees(-0.5, 4)).toBe(-2);
    expect(pointerCameraYawDegrees(1, 0, 0)).toBe(0);
    expect(pointerCameraYawDegrees(-1, 0, 10)).toBe(-10);
  });

  it("turns the head about a stationary eye, keeping the aim's distance", () => {
    const eye = { eyeX: 0.8, eyeY: 0.25, eyeZ: 5.7 };
    const look = { lookX: 0.8, lookY: -0.08, lookZ: -0.2 };
    const still = aimForHeadTurn({
      ...eye,
      ...look,
      pitchRadians: 0,
      yawRadians: 0,
    });
    expect(still.x).toBeCloseTo(look.lookX, 10);
    expect(still.y).toBeCloseTo(look.lookY, 10);
    expect(still.z).toBeCloseTo(look.lookZ, 10);
    const turned = aimForHeadTurn({
      ...eye,
      ...look,
      pitchRadians: (2 * Math.PI) / 180,
      yawRadians: (3 * Math.PI) / 180,
    });
    // Up and to the right, from the same eye, at the same reach.
    expect(turned.x).toBeGreaterThan(look.lookX);
    expect(turned.y).toBeGreaterThan(look.lookY);
    const reach = (p: { x: number; y: number; z: number }) =>
      Math.hypot(p.x - eye.eyeX, p.y - eye.eyeY, p.z - eye.eyeZ);
    expect(reach(turned)).toBeCloseTo(
      Math.hypot(
        look.lookX - eye.eyeX,
        look.lookY - eye.eyeY,
        look.lookZ - eye.eyeZ,
      ),
      10,
    );
    const yawOf = (p: { x: number; z: number }) =>
      Math.atan2(p.x - eye.eyeX, -(p.z - eye.eyeZ));
    expect(yawOf(turned) - yawOf(still)).toBeCloseTo((3 * Math.PI) / 180, 10);
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
