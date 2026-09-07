import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ABOUT_AIC_BASE_DEPTH,
  ABOUT_AIC_BASE_WIDTH,
} from "./aboutAwardGeometry";
import {
  ABOUT_BOOT_LANDMARKS,
  aboutProjectedBoxWidth,
} from "./aboutBootComposition";
import {
  ABOUT_AIC_SCALE,
  ABOUT_COORDINATION_GLOBE_SCALE,
  ABOUT_COORDINATION_TARGET_X,
  ABOUT_LAMP_CAMERA_REVEAL,
  ABOUT_LAMP_HEAD_QUATERNION,
  ABOUT_LAMP_HEAD_TARGET,
  ABOUT_LAMP_ROOT_POSITION,
  ABOUT_LAMP_ROOT_SCALE,
  ABOUT_LAMP_ROOT_YAW,
  ABOUT_OG_LAMP_CAMERA_REVEAL,
  ABOUT_OG_LAMP_HEAD_QUATERNION,
  ABOUT_OG_LAMP_HEAD_TARGET,
  ABOUT_TJ_LIGHT_YAW,
  aboutLampHeadQuaternion,
  aboutShelfIntervals,
} from "./aboutCoordinationLayout";
import {
  ABOUT_AIC_ROOT_YAW,
  ABOUT_LANDMARK_X,
  ABOUT_LOWER_LANDMARK_Z,
} from "./aboutScenePose";
import {
  DESK_LAMP_HEAD_AXIS,
  DESK_LAMP_MOUTH,
  articulatedDeskLampDirection,
  articulatedDeskLampPoint,
} from "./deskLampHead";
import { SHELF_GEOMETRY } from "./shelfGeometry";
import {
  SHELF_PROP_UNITS_PER_METRE,
  VISION_PRO_DISPLAY_WIDTH,
  VISION_PRO_MODEL_SCALE,
  VISION_PRO_MODEL_WIDTH,
  VISION_PRO_PROFILE,
  VISION_PRO_REAL_WIDTH_METRES,
} from "./visionProGeometry";
import { CAMERA } from "./worldLayout";

function expectGap(shelf: "top" | "lower", leftId: string, rightId: string) {
  const intervals = aboutShelfIntervals(shelf);
  const left = intervals.find(({ id }) => id === leftId)!;
  const right = intervals.find(({ id }) => id === rightId)!;
  expect(right.left - left.right).toBeGreaterThan(0);
}

function gap(shelf: "top" | "lower", leftId: string, rightId: string) {
  const intervals = aboutShelfIntervals(shelf);
  const left = intervals.find(({ id }) => id === leftId)!;
  const right = intervals.find(({ id }) => id === rightId)!;
  return right.left - left.right;
}

describe("About Coordination composition", () => {
  it("leaves honest shelf gaps around every relocated object", () => {
    // The succulent took the globe-to-portrait span when it and the cactus
    // swapped planks; the cactus now stands behind the family frame's plane
    // at the owner's layout-editor position, so it is not gap-checked here.
    //
    // The globe and the succulent are not gap-checked as flat silhouettes
    // either, since the 2026-09-06 placement: the mapped globe grew to 2.52
    // and the owner set the succulent under the ball's right shoulder, so
    // their front projections overlap by about 3 mm while the objects clear
    // each other in depth (0.12) and height (the ball rides 0.4 up). The
    // boot SVG paints the globe in front, which is what the room shows.
    expect(gap("top", "globe", "succulent")).toBeGreaterThan(-0.01);
    expectGap("top", "succulent", "portrait");
    expectGap("lower", "desk-lamp", "ai-collective");
    expectGap("lower", "ai-collective", "coordination-globe");
    expectGap("lower", "coordination-globe", "tj-medallion");
    expectGap("lower", "tj-medallion", "vision-pro");
    expectGap("lower", "vision-pro", "role-icons");
    expectGap("lower", "role-icons", "reading-stack");

    expect(ABOUT_BOOT_LANDMARKS["collective-frame"].shelf).toBe("top");
    expect(ABOUT_BOOT_LANDMARKS["collective-frame"].x).toBe(0.7978);
    expect(ABOUT_BOOT_LANDMARKS["role-icons"].x).toBeGreaterThan(
      ABOUT_BOOT_LANDMARKS["vision-pro"].x,
    );
    expect(ABOUT_BOOT_LANDMARKS["reading-stack"].x).toBeGreaterThan(
      ABOUT_BOOT_LANDMARKS["role-icons"].x,
    );
  });

  it("fills the only empty top-plank span with the succulent", () => {
    expect(ABOUT_BOOT_LANDMARKS.cactus.shelf).toBe("top");
    expect(ABOUT_BOOT_LANDMARKS.succulent.shelf).toBe("top");
    // The globe side is covered above: the ball overhangs the succulent by
    // the owner's choice, so only the portrait side keeps a clear span.
    expect(gap("top", "succulent", "portrait")).toBeGreaterThan(0.04);
  });

  it("keeps the owner-reviewed lower row inside the plank", () => {
    const lamp = aboutShelfIntervals("lower").find(
      ({ id }) => id === "desk-lamp",
    )!;
    const reading = aboutShelfIntervals("lower").find(
      ({ id }) => id === "reading-stack",
    )!;
    expect(lamp.left).toBeGreaterThan(-SHELF_GEOMETRY.width / 2);
    expect(reading.right).toBeLessThan(SHELF_GEOMETRY.width / 2);
  });

  it("persists the owner's lower-shelf centers and AIC light angle", () => {
    expect(ABOUT_LANDMARK_X).toMatchObject({
      "ai-collective": -0.8475,
      "coordination-globe": -0.5004,
      "tj-medallion": -0.1828,
      "vision-pro": 0.1527,
      "role-icons": 0.5233,
      "reading-stack": 1.0005,
    });
    expect(ABOUT_LOWER_LANDMARK_Z).toMatchObject({
      "ai-collective": -0.1147,
      "coordination-globe": -0.0795,
      "tj-medallion": -0.045,
      "vision-pro": -0.0938,
      "role-icons": -0.0283,
      "reading-stack": -0.0231,
    });
    expect(ABOUT_AIC_ROOT_YAW).toBe(-0.1814);
  });

  it("preserves clearance around the lower keepsakes", () => {
    expect(gap("lower", "ai-collective", "coordination-globe")).toBeGreaterThan(
      0.015,
    );
    expect(gap("lower", "coordination-globe", "tj-medallion")).toBeGreaterThan(
      0,
    );
    expect(gap("lower", "tj-medallion", "vision-pro")).toBeGreaterThan(0.008);
    expect(gap("lower", "vision-pro", "role-icons")).toBeGreaterThan(0);
    expect(gap("lower", "role-icons", "reading-stack")).toBeGreaterThan(0.04);
  });

  it("keeps TJ at the owner's additional small scale increase", () => {
    expect(ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale).toBeCloseTo(
      0.55 * 1.2 * 1.1 * 1.0569,
      10,
    );
    expect(ABOUT_BOOT_LANDMARKS["vision-pro"].profile).toEqual(
      VISION_PRO_PROFILE,
    );
    expect(ABOUT_BOOT_LANDMARKS["ai-collective"].profile.width).toBeCloseTo(
      aboutProjectedBoxWidth(
        ABOUT_AIC_BASE_WIDTH,
        ABOUT_AIC_BASE_DEPTH,
        ABOUT_AIC_ROOT_YAW,
      ) *
        1.1 *
        1.2 *
        1.1 *
        1.2,
      10,
    );
  });

  it("renders Vision Pro at Apple's published cover width", () => {
    expect(VISION_PRO_REAL_WIDTH_METRES).toBe(0.18536);
    expect(VISION_PRO_DISPLAY_WIDTH).toBeCloseTo(
      VISION_PRO_REAL_WIDTH_METRES * SHELF_PROP_UNITS_PER_METRE,
      10,
    );
    expect(VISION_PRO_MODEL_WIDTH * VISION_PRO_MODEL_SCALE).toBeCloseTo(
      VISION_PRO_DISPLAY_WIDTH,
      10,
    );
    expect(VISION_PRO_PROFILE.width).toBeGreaterThan(VISION_PRO_DISPLAY_WIDTH);
  });

  it("enlarges AIC and the orb by another twenty percent", () => {
    expect(ABOUT_AIC_SCALE).toBeCloseTo(1.1 * 1.2 * 1.1 * 1.2, 10);
    expect(ABOUT_COORDINATION_GLOBE_SCALE).toBeCloseTo(
      1.155 * 1.2 * 1.1 * 1.2,
      10,
    );
  });

  it("aims across the AIC–Coordination midpoint with a camera-side sliver", () => {
    expect(ABOUT_COORDINATION_TARGET_X).toBeCloseTo(
      (ABOUT_BOOT_LANDMARKS["ai-collective"].x +
        ABOUT_BOOT_LANDMARKS["coordination-globe"].x) /
        2,
      10,
    );

    const mouth = new THREE.Vector3(
      ...articulatedDeskLampPoint({
        point: DESK_LAMP_MOUTH,
        headQuaternion: ABOUT_LAMP_HEAD_QUATERNION,
        rootPosition: ABOUT_LAMP_ROOT_POSITION,
        rootYaw: ABOUT_LAMP_ROOT_YAW,
        rootScale: ABOUT_LAMP_ROOT_SCALE,
      }),
    );
    const target = new THREE.Vector3(
      ABOUT_LAMP_ROOT_POSITION[0] + ABOUT_LAMP_HEAD_TARGET[0],
      ABOUT_LAMP_ROOT_POSITION[1] + ABOUT_LAMP_HEAD_TARGET[1],
      ABOUT_LAMP_ROOT_POSITION[2] + ABOUT_LAMP_HEAD_TARGET[2],
    );
    const expected = target.sub(mouth).normalize();
    const actual = new THREE.Vector3(
      ...articulatedDeskLampDirection({
        direction: DESK_LAMP_HEAD_AXIS,
        headQuaternion: ABOUT_LAMP_HEAD_QUATERNION,
        rootYaw: ABOUT_LAMP_ROOT_YAW,
      }),
    );
    const cameraFacing = actual.dot(
      new THREE.Vector3(0, CAMERA.y, CAMERA.z).sub(mouth).normalize(),
    );

    expect(actual.dot(expected)).toBeCloseTo(1, 10);
    expect(ABOUT_LAMP_CAMERA_REVEAL).toBe(0.145);
    expect(cameraFacing).toBeGreaterThan(0.2);
    expect(cameraFacing).toBeLessThan(0.24);
    expect(ABOUT_LAMP_HEAD_QUATERNION).not.toEqual([0, 0, 0, 1]);
  });

  it("turns the OG lamp away from the camera while retaining the authored target", () => {
    const mouth = new THREE.Vector3(
      ...articulatedDeskLampPoint({
        point: DESK_LAMP_MOUTH,
        headQuaternion: ABOUT_OG_LAMP_HEAD_QUATERNION,
        rootPosition: ABOUT_LAMP_ROOT_POSITION,
        rootYaw: ABOUT_LAMP_ROOT_YAW,
        rootScale: ABOUT_LAMP_ROOT_SCALE,
      }),
    );
    const target = new THREE.Vector3(
      ABOUT_LAMP_ROOT_POSITION[0] + ABOUT_OG_LAMP_HEAD_TARGET[0],
      ABOUT_LAMP_ROOT_POSITION[1] + ABOUT_OG_LAMP_HEAD_TARGET[1],
      ABOUT_LAMP_ROOT_POSITION[2] + ABOUT_OG_LAMP_HEAD_TARGET[2],
    );
    const actual = new THREE.Vector3(
      ...articulatedDeskLampDirection({
        direction: DESK_LAMP_HEAD_AXIS,
        headQuaternion: ABOUT_OG_LAMP_HEAD_QUATERNION,
        rootYaw: ABOUT_LAMP_ROOT_YAW,
      }),
    );
    const cameraFacing = actual.dot(
      new THREE.Vector3(0, CAMERA.y, CAMERA.z).sub(mouth).normalize(),
    );

    expect(actual.dot(target.sub(mouth).normalize())).toBeCloseTo(1, 10);
    expect(ABOUT_OG_LAMP_CAMERA_REVEAL).toBe(0.057);
    expect(cameraFacing).toBeGreaterThan(0.07);
    expect(cameraFacing).toBeLessThan(0.09);
    expect(aboutLampHeadQuaternion(true)).toBe(ABOUT_OG_LAMP_HEAD_QUATERNION);
    expect(aboutLampHeadQuaternion(false)).toBe(ABOUT_LAMP_HEAD_QUATERNION);
  });

  it("turns the TJ metal face modestly toward the lamp", () => {
    expect(ABOUT_TJ_LIGHT_YAW).toBeLessThan(-0.16);
    expect(ABOUT_TJ_LIGHT_YAW).toBeGreaterThan(-0.4);
  });
});
