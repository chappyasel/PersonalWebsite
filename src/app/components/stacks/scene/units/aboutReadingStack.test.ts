import { describe, expect, it } from "vitest";

import {
  ABOUT_LOWER_PHOTO_LEFT,
  ABOUT_READING_BOOK,
  ABOUT_SMALL_PLANT_ENVELOPE,
  ABOUT_SMALL_PLANT_X,
  CURRENT_READING_BASE,
  CURRENT_READING_ROTATION,
  aboutReadingSnapshot,
  readingBookPoint3,
  readingCoverForward,
  readingHeldRotation,
  readingStackBounds,
  readingStackPoses,
} from "./aboutReadingStack";

describe("About current-reading book", () => {
  it("authors exactly one book, square to the camera", () => {
    const poses = readingStackPoses();

    expect(poses).toHaveLength(1);
    expect(poses[0]).toEqual({
      index: 0,
      base: CURRENT_READING_BASE,
      rotation: CURRENT_READING_ROTATION,
    });
    expect(readingCoverForward(poses[0].rotation)).toBeCloseTo(1, 8);
  });

  it("rests its complete bottom edge directly on the shelf", () => {
    const [current] = readingStackPoses();
    const leftFoot = readingBookPoint3(current, "shelf-toe");
    const rightFoot = readingBookPoint3(current, "lean-contact");

    expect(leftFoot[1]).toBeCloseTo(0, 8);
    expect(rightFoot[1]).toBeCloseTo(0, 8);
    expect(rightFoot[0] - leftFoot[0]).toBeCloseTo(ABOUT_READING_BOOK.width, 8);
    expect(leftFoot[2]).toBeCloseTo(rightFoot[2], 8);
  });

  it("has an upright, shelf-grounded silhouette", () => {
    const bounds = readingStackBounds(readingStackPoses());

    expect(bounds.bottom).toBeCloseTo(0, 8);
    expect(bounds.top).toBeCloseTo(ABOUT_READING_BOOK.depth, 8);
    expect(bounds.right - bounds.left).toBeCloseTo(ABOUT_READING_BOOK.width, 8);
  });

  it("does not change orientation when carried because it already faces the viewer", () => {
    const [current] = readingStackPoses();

    expect(readingHeldRotation(current.rotation, 1)).toEqual(current.rotation);
    expect(readingHeldRotation(current.rotation, 0)).toEqual(current.rotation);
  });

  it("keeps grounded clearance before the small plant and lower photo", () => {
    const snapshot = aboutReadingSnapshot();

    expect(snapshot.poses).toHaveLength(1);
    expect(snapshot.contactError.shelf).toBeLessThan(1e-10);
    expect(snapshot.plant.shelfY).toBe(0);
    expect(snapshot.plant.gapFromBooks).toBeGreaterThan(0);
    expect(snapshot.plant.gapFromPhoto).toBeGreaterThan(0);
    expect(snapshot.bounds.right).toBeLessThan(
      ABOUT_SMALL_PLANT_X - ABOUT_SMALL_PLANT_ENVELOPE,
    );
    expect(ABOUT_SMALL_PLANT_X + ABOUT_SMALL_PLANT_ENVELOPE).toBeLessThan(
      ABOUT_LOWER_PHOTO_LEFT,
    );
  });
});
