import { GOLF_STOP_POSITION } from "../data";
import { describe, expect, it } from "vitest";

import { GOLF_CUP_WORLD_CENTER } from "./golf/golfCourse";
import { GOLF_YAW_EYE_TRAVEL, golfYawRig } from "./golfYawPivot";
import {
  POINTER_CAMERA_YAW_MAX_DEGREES,
  eyeXZForYawAroundTarget,
} from "./pointerCameraTilt";
import {
  RAIL_RIGHT_PX_FALLBACK,
  UNIT_SPACING,
  cameraCompositionForViewport,
  golfDollyForViewport,
} from "./worldLayout";

// The desktop golf-stop rig, as CameraRig builds it before any pointer.
const composition = cameraCompositionForViewport(
  1440,
  900,
  GOLF_STOP_POSITION,
  RAIL_RIGHT_PX_FALLBACK,
);
const eye = {
  x: GOLF_STOP_POSITION * UNIT_SPACING + composition.lateralOffset,
  z: composition.z - golfDollyForViewport(1440, true),
};
const look = { x: eye.x, z: composition.lookZ };
const pivot = { x: GOLF_CUP_WORLD_CENTER.x, z: GOLF_CUP_WORLD_CENTER.z };
const args = {
  eyeX: eye.x,
  eyeZ: eye.z,
  lookX: look.x,
  lookZ: look.z,
  pivotX: pivot.x,
  pivotZ: pivot.z,
};

/** Bearing of a world point from the eye, relative to the view direction,
 * in degrees, positive to the right. What the visitor sees as "where on
 * screen". */
function bearing(
  from: { x: number; z: number },
  aim: { x: number; z: number },
  point: { x: number; z: number },
) {
  const view = Math.atan2(aim.x - from.x, -(aim.z - from.z));
  const to = Math.atan2(point.x - from.x, -(point.z - from.z));
  return ((to - view) * 180) / Math.PI;
}

describe("golf yaw pivot", () => {
  it("is the identity at rest", () => {
    expect(golfYawRig({ ...args, run: 0 })).toEqual({
      eyeX: eye.x,
      eyeZ: eye.z,
      lookX: look.x,
      lookZ: look.z,
    });
  });

  it("pins the cup while the bay slides left for a rightward pointer, like the pan", () => {
    const rig = golfYawRig({ ...args, run: 1 });
    const before = { x: eye.x, z: eye.z };
    const after = { x: rig.eyeX, z: rig.eyeZ };
    const aimAfter = { x: rig.lookX, z: rig.lookZ };
    // A world point in the hitting bay, a little left of the camera axis.
    const tee = { x: eye.x - 1, z: eye.z - 4.6 };
    const far = { x: eye.x, z: eye.z - 30 };

    expect(bearing(after, aimAfter, pivot)).toBeCloseTo(
      bearing(before, look, pivot),
      6,
    );
    // Pointer right: the tee moves LEFT (negative), by a readable amount. A
    // visitor reaching for a ball must never see it run away from the
    // pointer; the first cut did exactly that.
    const teeShift = bearing(after, aimAfter, tee) - bearing(before, look, tee);
    expect(teeShift).toBeLessThan(-4);
    expect(teeShift).toBeGreaterThan(-9);

    // The same sense the shelf orbit gives its background: pointer right,
    // the world slides left. Only the pivot differs.
    const orbit = eyeXZForYawAroundTarget({
      eyeX: eye.x,
      eyeZ: eye.z,
      lookX: look.x,
      lookZ: look.z,
      yawRadians: (POINTER_CAMERA_YAW_MAX_DEGREES * Math.PI) / 180,
    });
    expect(
      bearing({ x: orbit.x, z: orbit.z }, look, far) -
        bearing(before, look, far),
    ).toBeLessThan(0);
    // Beyond the cup the rig's own turn shows: a small drift the other way.
    const skyShift = bearing(after, aimAfter, far) - bearing(before, look, far);
    expect(skyShift).toBeGreaterThan(0);
    expect(skyShift).toBeLessThan(1.5);
  });

  it("steps the eye by the authored travel, toward +x for a rightward run", () => {
    const rig = golfYawRig({ ...args, run: 1 });
    expect(Math.hypot(rig.eyeX - eye.x, rig.eyeZ - eye.z)).toBeCloseTo(
      GOLF_YAW_EYE_TRAVEL,
      6,
    );
    expect(rig.eyeX).toBeGreaterThan(eye.x);
    // The distance to the cup is preserved: an orbit, not a truck.
    expect(Math.hypot(rig.eyeX - pivot.x, rig.eyeZ - pivot.z)).toBeCloseTo(
      Math.hypot(eye.x - pivot.x, eye.z - pivot.z),
      9,
    );
  });

  it("is odd in the run and clamps it", () => {
    const right = golfYawRig({ ...args, run: 0.5 });
    const left = golfYawRig({ ...args, run: -0.5 });
    // Mirror runs step the same distance the opposite way. (The x parts
    // alone are not exactly odd: a rotation has an even cosine term.)
    expect(Math.hypot(right.eyeX - eye.x, right.eyeZ - eye.z)).toBeCloseTo(
      Math.hypot(left.eyeX - eye.x, left.eyeZ - eye.z),
      9,
    );
    expect(Math.sign(right.eyeX - eye.x)).toBe(-Math.sign(left.eyeX - eye.x));
    expect(golfYawRig({ ...args, run: 3 })).toEqual(
      golfYawRig({ ...args, run: 1 }),
    );
    expect(golfYawRig({ ...args, run: Number.NaN })).toEqual(
      golfYawRig({ ...args, run: 0 }),
    );
  });
});
