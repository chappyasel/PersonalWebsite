import { describe, expect, it } from "vitest";

import {
  ABOUT_LOWER_PHOTO_LEFT,
  ABOUT_READING_BOOK,
  ABOUT_SMALL_PLANT_ENVELOPE,
  ABOUT_SMALL_PLANT_X,
  READING_HELD_COVER_TILT,
  aboutReadingSnapshot,
  readingBookPoint,
  readingBookPoint3,
  readingHeldRotation,
  readingStackBounds,
  readingStackPoses,
} from "./aboutReadingStack";

const closePoint = (actual: [number, number], expected: [number, number]) => {
  expect(actual[0]).toBeCloseTo(expected[0], 8);
  expect(actual[1]).toBeCloseTo(expected[1], 8);
};

const closePoint3 = (
  actual: [number, number, number],
  expected: [number, number, number],
) => {
  expect(actual[0]).toBeCloseTo(expected[0], 8);
  expect(actual[1]).toBeCloseTo(expected[1], 8);
  expect(actual[2]).toBeCloseTo(expected[2], 8);
};

describe("About current-reading stack", () => {
  it("seats the third-most-recent flat on the shelf", () => {
    const [, , third] = readingStackPoses();
    expect(third.rotation[2]).toBe(0);
    expect(third.base[1] - ABOUT_READING_BOOK.thickness / 2).toBeCloseTo(0, 8);
  });

  it("lays the middle book almost flat with a compact overlap", () => {
    const [, second, third] = readingStackPoses();
    const thirdTop = third.base[1] + ABOUT_READING_BOOK.thickness / 2;

    expect(Math.abs(second.rotation[2])).toBeLessThanOrEqual(Math.PI / 36);
    expect(second.base[1] - ABOUT_READING_BOOK.thickness / 2).toBeCloseTo(
      thirdTop,
      8,
    );
    expect(Math.abs(second.base[0] - third.base[0])).toBeLessThan(0.04);
  });

  it("plants the newest on the shelf left/behind the stack and leans toward it", () => {
    const [mostRecent, second, third] = readingStackPoses();
    const toe = readingBookPoint3(mostRecent, "shelf-toe");
    const stackLeft = third.base[0] - ABOUT_READING_BOOK.width / 2;

    expect(toe[1]).toBeCloseTo(0, 8);
    expect(toe[0]).toBeLessThan(stackLeft);
    expect(toe[2]).toBeLessThan(second.base[2]);
    expect(mostRecent.rotation[2]).toBeGreaterThan(0);
  });

  it("leans its upper body into the rear-left face of the horizontal stack", () => {
    const [mostRecent, second] = readingStackPoses();
    closePoint(
      readingBookPoint(mostRecent, "lean-contact"),
      readingBookPoint(second, "stack-contact"),
    );
    closePoint3(
      readingBookPoint3(mostRecent, "lean-contact"),
      readingBookPoint3(second, "stack-contact"),
    );
    // The reference's blue book stands behind the horizontal pair and leans
    // 30 degrees away from vertical, rising toward the stack at screen-right.
    expect(mostRecent.rotation[2]).toBeCloseTo((60 * Math.PI) / 180, 8);
    expect(mostRecent.rotation[0]).toBeGreaterThan(0.25);
    expect(mostRecent.base[0]).toBeLessThan(second.base[0]);
  });

  it("keeps the reference silhouette compact instead of three diving boards", () => {
    const poses = readingStackPoses();
    const bounds = readingStackBounds(poses);
    const horizontalBase = readingStackBounds(poses.slice(1));
    expect(horizontalBase.right - horizontalBase.left).toBeLessThan(0.36);
    expect(bounds.right - bounds.left).toBeLessThan(0.56);
    expect(bounds.top).toBeLessThan(0.5);
  });

  it("leaves grounded clearance for the small plant before the lower photo", () => {
    const bounds = readingStackBounds(readingStackPoses());
    expect(bounds.right).toBeLessThan(
      ABOUT_SMALL_PLANT_X - ABOUT_SMALL_PLANT_ENVELOPE,
    );
    expect(ABOUT_SMALL_PLANT_X + ABOUT_SMALL_PLANT_ENVELOPE).toBeLessThan(
      ABOUT_LOWER_PHOTO_LEFT,
    );
  });

  it("turns a carried cover toward the viewer and restores its exact rest pose", () => {
    const [mostRecent] = readingStackPoses();
    const held = readingHeldRotation(mostRecent.rotation, 1);
    expect(held[0]).toBe(READING_HELD_COVER_TILT);
    expect(Math.abs(held[2])).toBeLessThan(Math.abs(mostRecent.rotation[2]));
    expect(readingHeldRotation(mostRecent.rotation, 0)).toEqual(
      mostRecent.rotation,
    );
  });

  it("publishes zero-error contacts and positive plant clearances for QA", () => {
    const snapshot = aboutReadingSnapshot();
    expect(snapshot.contactError.second).toBeLessThan(1e-10);
    expect(snapshot.contactError.shelf).toBeLessThan(1e-10);
    expect(snapshot.contactError.newest).toBeLessThan(1e-10);
    expect(snapshot.plant.shelfY).toBe(0);
    expect(snapshot.plant.gapFromBooks).toBeGreaterThan(0);
    expect(snapshot.plant.gapFromPhoto).toBeGreaterThan(0);
  });
});
