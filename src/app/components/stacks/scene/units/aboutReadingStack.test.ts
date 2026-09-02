import { ABOUT_BOOT_LANDMARKS } from "../aboutBootComposition";
import { ABOUT_LOWER_LANDMARK_Z } from "../aboutScenePose";
import { describe, expect, it } from "vitest";

import {
  ABOUT_READING_BOOK,
  ABOUT_READING_COVER_IMAGE,
  ABOUT_TOP_COLLECTIVE_PHOTO_LEFT,
  ABOUT_TOP_COLLECTIVE_PHOTO_X,
  CURRENT_READING_BASE,
  CURRENT_READING_ROTATION,
  READING_FAN_CLEARANCE,
  READING_FAN_SPACING_X,
  READING_FAN_SPACING_Z,
  aboutReadingSnapshot,
  readingBookAtAuthoredPose,
  readingBookFrontElevation,
  readingBookPoint3,
  readingCoverForward,
  readingCoverLampward,
  readingHeldRotation,
  readingStackBounds,
  readingStackPoses,
} from "./aboutReadingStack";

describe("About recent-reading fan", () => {
  it("gives the cover art less margin above and below than at its sides", () => {
    const horizontalMargin =
      (ABOUT_READING_BOOK.width - ABOUT_READING_COVER_IMAGE.width) / 2;
    const verticalMargin =
      (ABOUT_READING_BOOK.depth - ABOUT_READING_COVER_IMAGE.height) / 2;

    expect(verticalMargin).toBeCloseTo(0.01, 8);
    expect(verticalMargin).toBeLessThan(horizontalMargin);
  });

  it("projects the exact three live covers into the boot front elevation", () => {
    const elevations = readingStackPoses().map(readingBookFrontElevation);

    expect(elevations).toHaveLength(3);
    expect(
      elevations.map((points) => Math.min(...points.map(([, y]) => y))),
    ).toEqual([0, 0, 0]);
    expect(
      elevations.map((points) =>
        Number(
          (
            Math.max(...points.map(([x]) => x)) -
            Math.min(...points.map(([x]) => x))
          ).toFixed(4),
        ),
      ),
    ).toEqual([0.2402, 0.2402, 0.2402]);
  });
  it("authors three grounded books turned 40 degrees toward the lamp", () => {
    const poses = readingStackPoses();

    expect(poses).toHaveLength(3);
    expect(poses[0].index).toBe(0);
    poses[0].base.forEach((coordinate, axis) =>
      expect(coordinate).toBeCloseTo(CURRENT_READING_BASE[axis]!, 12),
    );
    expect(poses[0].rotation).toEqual(CURRENT_READING_ROTATION);
    expect(poses[0].base[0]).toBeCloseTo(
      ABOUT_BOOT_LANDMARKS["reading-stack"].x - READING_FAN_SPACING_X,
      10,
    );
    expect(poses[0].base[2]).toBeCloseTo(CURRENT_READING_BASE[2], 10);
    expect(readingCoverForward(poses[0].rotation)).toBeCloseTo(
      Math.cos((Math.PI * 2) / 9),
      8,
    );
    expect(readingCoverLampward(poses[0].rotation)).toBeLessThan(0);
    expect(poses[1].base[0] - poses[0].base[0]).toBeCloseTo(
      READING_FAN_SPACING_X,
      8,
    );
    expect(poses[1].base[2] - poses[0].base[2]).toBeCloseTo(
      READING_FAN_SPACING_Z,
      8,
    );
    expect(poses[2].base[2]).toBeGreaterThan(poses[1].base[2]);
  });

  it("tightens the camera overlap without reducing physical clearance", () => {
    // Perpendicular distance between neighbouring cover planes, which is what
    // decides whether a thick jacket intersects the next one.
    const yaw = (Math.PI * 2) / 9;
    const separation = (dx: number, dz: number) =>
      Math.abs(-Math.sin(yaw) * dx + Math.cos(yaw) * dz);
    expect(
      separation(READING_FAN_SPACING_X, READING_FAN_SPACING_Z),
    ).toBeGreaterThanOrEqual(separation(0.21, 0.075) - 0.002);
    expect(READING_FAN_SPACING_X).toBeLessThan(0.18);
  });

  it("keeps the same clear air between books of different thicknesses", () => {
    const thicknesses = [0.04, 0.099, 0.066];
    const poses = readingStackPoses(thicknesses);
    const yaw = CURRENT_READING_ROTATION[2];
    const normal = [-Math.sin(yaw), Math.cos(yaw)] as const;

    for (let index = 0; index < poses.length - 1; index += 1) {
      const left = poses[index]!;
      const right = poses[index + 1]!;
      const centerSeparation = Math.abs(
        (right.base[0] - left.base[0]) * normal[0] +
          (right.base[2] - left.base[2]) * normal[1],
      );
      const clearance =
        centerSeparation - (thicknesses[index]! + thicknesses[index + 1]!) / 2;

      expect(clearance).toBeCloseTo(READING_FAN_CLEARANCE, 10);
    }
  });

  it("rests its complete bottom edge directly on the shelf", () => {
    const [current] = readingStackPoses();
    const leftFoot = readingBookPoint3(current, "shelf-toe");
    const rightFoot = readingBookPoint3(current, "lean-contact");

    expect(leftFoot[1]).toBeCloseTo(0, 8);
    expect(rightFoot[1]).toBeCloseTo(0, 8);
    expect(rightFoot[0] - leftFoot[0]).toBeCloseTo(
      ABOUT_READING_BOOK.width * Math.cos((Math.PI * 2) / 9),
      8,
    );
    expect(Math.abs(rightFoot[2] - leftFoot[2])).toBeCloseTo(
      ABOUT_READING_BOOK.width * Math.sin((Math.PI * 2) / 9),
      8,
    );
  });

  it("has an upright, shelf-grounded silhouette", () => {
    const bounds = readingStackBounds(readingStackPoses());

    expect(bounds.bottom).toBeCloseTo(0, 8);
    expect(bounds.top).toBeCloseTo(ABOUT_READING_BOOK.depth, 8);
    expect(bounds.right - bounds.left).toBeGreaterThan(0.55);
  });

  it("centers the tightened fan on the owner-reviewed shelf mark and depth", () => {
    const poses = readingStackPoses();
    const mean = (axis: 0 | 2) =>
      poses.reduce((sum, pose) => sum + pose.base[axis], 0) / poses.length;

    expect(mean(0)).toBeCloseTo(ABOUT_BOOT_LANDMARKS["reading-stack"].x, 10);
    expect(mean(2)).toBeCloseTo(ABOUT_LOWER_LANDMARK_Z["reading-stack"], 10);
  });

  it("squares the jacket while carried and returns to the authored fan", () => {
    const [current] = readingStackPoses();

    expect(readingHeldRotation(current.rotation, 1)).toEqual([
      Math.PI / 2,
      0,
      0,
    ]);
    expect(readingHeldRotation(current.rotation, 0)).toEqual(current.rotation);
  });

  it("treats shelf hover presentation as authored-pose-only", () => {
    const [current] = readingStackPoses();
    const identity = { x: 0, y: 0, z: 0, w: 1 };

    expect(
      readingBookAtAuthoredPose(
        { x: current.base[0], y: current.base[1], z: current.base[2] },
        identity,
        current.base,
      ),
    ).toBe(true);
    expect(
      readingBookAtAuthoredPose(
        { x: current.base[0] + 0.02, y: current.base[1], z: current.base[2] },
        identity,
        current.base,
      ),
    ).toBe(false);
    expect(
      readingBookAtAuthoredPose(
        { x: current.base[0], y: current.base[1], z: current.base[2] },
        { x: 0.02, y: 0, z: 0, w: 0.9998 },
        current.base,
      ),
    ).toBe(false);
  });

  it("keeps the relocated collective photograph supported by the top plank", () => {
    const snapshot = aboutReadingSnapshot();

    expect(snapshot.poses).toHaveLength(3);
    expect(snapshot.contactError.shelf).toBeLessThan(1e-10);
    expect(snapshot.topCollectivePhoto.x).toBe(ABOUT_TOP_COLLECTIVE_PHOTO_X);
    expect(ABOUT_TOP_COLLECTIVE_PHOTO_LEFT).toBeGreaterThan(-1.6);
    expect(snapshot.topCollectivePhoto.right).toBeLessThan(1.6);
  });
});
