import { describe, expect, it } from "vitest";

import {
  ABOUT_BOOT_CAMERA,
  type AboutBootCamera,
  aboutBootBoxBounds,
  aboutBootPlankProjection,
  aboutBootRestCamera,
  aboutBootWorldPoint,
  projectAboutBootPoint,
  projectAboutBootQuad,
} from "./aboutBootPerspective";
import { aboutBootBoxHorizontalBounds } from "./aboutBootSupportProjection";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import { CAMERA, unitPose } from "./worldLayout";

describe("aboutBootRestCamera", () => {
  it("stands where CameraRig rests at the canonical desktop viewport", () => {
    // The pin the stage test carries: eye x 0.7241 is the About shift plus
    // its share of the dock truck at 1440×900 with the rail at 179px.
    expect(ABOUT_BOOT_CAMERA.eye[0]).toBeCloseTo(0.722, 2);
    expect(ABOUT_BOOT_CAMERA.eye[1]).toBeCloseTo(CAMERA.y, 6);
    expect(ABOUT_BOOT_CAMERA.eye[2]).toBeCloseTo(5.7228, 3);
    expect(ABOUT_BOOT_CAMERA.aim[0]).toBe(ABOUT_BOOT_CAMERA.eye[0]);
    expect(ABOUT_BOOT_CAMERA.aim[1]).toBeCloseTo(-0.08, 6);
    expect(ABOUT_BOOT_CAMERA.unitYaw).toBe(unitPose(0).rotation[1]);
    expect(ABOUT_BOOT_CAMERA.unitYaw).toBeCloseTo(0.1, 6);
  });

  it("looks down at the shelf by about three degrees", () => {
    const [, eyeY, eyeZ] = ABOUT_BOOT_CAMERA.eye;
    const [, aimY, aimZ] = ABOUT_BOOT_CAMERA.aim;
    const pitch = (Math.atan2(eyeY - aimY, eyeZ - aimZ) * 180) / Math.PI;
    expect(pitch).toBeGreaterThan(3);
    expect(pitch).toBeLessThan(3.4);
  });
});

describe("projectAboutBootPoint", () => {
  it("reduces to the old distance scaling with the eye at the origin, level, and no yaw", () => {
    const level: AboutBootCamera = {
      eye: [0, 0, CAMERA.z],
      aim: [0, 0, 0],
      unitYaw: 0,
    };
    for (const [x, y, z] of [
      [1.2, -0.9, -0.32],
      [-0.7, 0.4, 0.25],
      [0.3, -1.1, 0.62],
    ] as const) {
      const p = projectAboutBootPoint([x, y, z], level);
      const old = CAMERA.z / (CAMERA.z - z);
      expect(p.scale).toBeCloseTo(old, 12);
      expect(p.x).toBeCloseTo(x * old, 12);
      expect(p.y).toBeCloseTo(y * old, 12);
    }
    // And so the supports' old horizontal bounds are this projector's.
    const bounds = aboutBootBoxBounds(
      {
        centerX: 1.07,
        width: 0.07,
        centerZ: -0.32,
        depth: 0.07,
        top: 0,
        bottom: -1,
      },
      level,
    );
    const old = aboutBootBoxHorizontalBounds(1.07, 0.07, -0.32, 0.07);
    expect(bounds.x).toBeCloseTo(old.x, 12);
    expect(bounds.width).toBeCloseTo(old.width, 12);
  });

  it("matches the running scene's projection at 2056×1290", () => {
    // Measured on 2026-09-07 through `__stacks.project` at the reveal, with
    // the pointer at its rest: unit 0's origin at (663.6, 621.3) and a plane
    // unit of 381.9px. World points, so the unit yaw is taken out. The
    // camera's idle bob was about 0.02 into its swing, worth a couple of
    // thousandths in the vertical.
    const rest = aboutBootRestCamera(2056, 1290, 179);
    const world: AboutBootCamera = { ...rest, unitYaw: 0 };
    expect(rest.eye[0]).toBeCloseTo(0.9526, 3);
    const px = projectAboutBootPoint([1, 0, 0], world);
    expect(px.x).toBeCloseTo((1045.5 - 663.6) / 381.9, 2);
    expect(px.y).toBeCloseTo(0, 3);
    const py = projectAboutBootPoint([0, 1, 0], world);
    expect(py.x).toBeCloseTo((659.8 - 663.6) / 381.9, 2);
    expect(py.y).toBeCloseTo((621.3 - 235.9) / 381.9, 2);
    const pz = projectAboutBootPoint([0, 0, -1], world);
    expect(pz.x).toBeCloseTo((717.9 - 663.6) / 381.9, 2);
    expect(pz.y).toBeCloseTo((621.3 - 605.6) / 381.9, 1);
    expect(pz.scale).toBeLessThan(1);
  });

  it("turns unit-local points through the unit's yaw before projecting", () => {
    const left = aboutBootWorldPoint([-1.32, 0, 0], 0.1);
    expect(left[0]).toBeCloseTo(-1.32 * Math.cos(0.1), 12);
    expect(left[2]).toBeCloseTo(1.32 * Math.sin(0.1), 12);
    // The left end of the About shelf is nearer, so it renders larger and,
    // being below the eye, lower; the right end the opposite.
    const lowerLeft = projectAboutBootPoint([-1.32, -0.87, 0]);
    const lowerRight = projectAboutBootPoint([1.32, -0.87, 0]);
    expect(lowerLeft.scale).toBeGreaterThan(1);
    expect(lowerRight.scale).toBeLessThan(1);
    expect(lowerLeft.y).toBeLessThan(lowerRight.y);
    // About 20px of tilt across a 2056-wide window: 0.05 plane units.
    expect(lowerRight.y - lowerLeft.y).toBeGreaterThan(0.035);
    expect(lowerRight.y - lowerLeft.y).toBeLessThan(0.07);
  });

  it("scales a floor prop nearer than the plane up by about a tenth", () => {
    const dumbbell = projectAboutBootPoint([1.05, SHELF_GEOMETRY.groundY, 0.62]);
    expect(dumbbell.scale).toBeGreaterThan(1.08);
    expect(dumbbell.scale).toBeLessThan(1.13);
    // On the plane, at the origin, nothing moves.
    const origin = projectAboutBootPoint([0, 0, 0]);
    expect(origin.x).toBeCloseTo(0, 12);
    expect(origin.y).toBeCloseTo(0, 12);
    expect(origin.scale).toBeCloseTo(1, 12);
  });
});

describe("aboutBootPlankProjection", () => {
  it("shares the front face's top edge with the top surface's near edge", () => {
    const plank = { width: 2.64, ...SHELF_GEOMETRY.lower };
    const projection = aboutBootPlankProjection(plank);
    expect(projection.top[3]).toEqual(projection.front[0]);
    expect(projection.top[2]).toEqual(projection.front[1]);
    // The camera looks down, so the far edge sits above the near edge.
    expect(projection.top[0][1]).toBeGreaterThan(projection.top[3][1]);
    expect(projection.top[1][1]).toBeGreaterThan(projection.top[2][1]);
    // The near (left) end is wider on screen than the far (right) end.
    const leftHeight = projection.front[0][1] - projection.front[3][1];
    const rightHeight = projection.front[1][1] - projection.front[2][1];
    expect(leftHeight).toBeGreaterThan(rightHeight);
  });

  it("projects quads corner by corner through the same projector", () => {
    const corners = [
      [-1, 0, 0],
      [1, 0, 0],
      [1, -1, 0],
      [-1, -1, 0],
    ] as const;
    const quad = projectAboutBootQuad(corners);
    corners.forEach((corner, index) => {
      const p = projectAboutBootPoint(corner);
      expect(quad[index]![0]).toBe(p.x);
      expect(quad[index]![1]).toBe(p.y);
    });
  });
});
