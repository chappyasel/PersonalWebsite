import { describe, expect, it } from "vitest";

import {
  ABOUT_LOWER_PHOTO_LEFT,
  ABOUT_LOWER_PHOTO_X,
  ABOUT_READING_BOOK,
  CURRENT_READING_BASE,
  CURRENT_READING_ROTATION,
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
    expect(poses[0]).toEqual({
      index: 0,
      base: CURRENT_READING_BASE,
      rotation: CURRENT_READING_ROTATION,
    });
    expect(poses[0].base[0]).toBe(0.33);
    expect(readingCoverForward(poses[0].rotation)).toBeCloseTo(
      Math.cos((Math.PI * 2) / 9),
      8,
    );
    expect(readingCoverLampward(poses[0].rotation)).toBeLessThan(0);
    expect(poses[1].base[0] - poses[0].base[0]).toBeCloseTo(0.18, 8);
    expect(poses[2].base[2]).toBeGreaterThan(poses[1].base[2]);
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
    expect(bounds.right - bounds.left).toBeGreaterThan(
      ABOUT_READING_BOOK.width * 2,
    );
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

  it("keeps the lower-right photograph fully supported by the plank", () => {
    const snapshot = aboutReadingSnapshot();

    expect(snapshot.poses).toHaveLength(3);
    expect(snapshot.contactError.shelf).toBeLessThan(1e-10);
    expect(snapshot.lowerPhoto.x).toBe(ABOUT_LOWER_PHOTO_X);
    expect(ABOUT_LOWER_PHOTO_LEFT).toBeGreaterThan(-1.6);
    expect(snapshot.lowerPhoto.right).toBeLessThan(1.6);
  });
});
