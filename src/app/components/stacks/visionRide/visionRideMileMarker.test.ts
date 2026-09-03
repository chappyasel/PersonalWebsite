import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_MILE_MARKER,
  checkpointShatterProgress,
  mileMarkerDigitSegments,
  mileMarkerPresentation,
} from "./visionRideMileMarker";

describe("Vision ride mile marker", () => {
  it("stays absent until the first 30-second crossing", () => {
    expect(mileMarkerPresentation(29.99, 12, false).visible).toBe(false);
    const arriving = mileMarkerPresentation(30, 0, false);
    expect(arriving).toMatchObject({ visible: true, number: 1 });
    expect(arriving.z).toBe(VISION_RIDE_MILE_MARKER.farZ);
  });

  it("crosses by integrated distance and disappears behind the camera", () => {
    const start = mileMarkerPresentation(60, 0, false);
    const middle = mileMarkerPresentation(60, 38, false);
    const passed = mileMarkerPresentation(
      60,
      VISION_RIDE_MILE_MARKER.nearZ - VISION_RIDE_MILE_MARKER.farZ + 0.01,
      false,
    );
    expect(start.number).toBe(2);
    expect(middle.z - start.z).toBeCloseTo(38, 9);
    expect(middle.progress).toBeGreaterThan(0);
    expect(passed.visible).toBe(false);
    expect(mileMarkerPresentation(90, 0, false).number).toBe(3);
  });

  it("renders two seven-segment digits and remains absent under reduced motion", () => {
    expect(mileMarkerDigitSegments(1)).toEqual(["abcdef", "bc"]);
    expect(mileMarkerDigitSegments(42)).toEqual(["bcfg", "abdeg"]);
    expect(mileMarkerPresentation(60, 12, true).visible).toBe(false);
  });

  it("shatters only after reaching the car and finishes over a short pass", () => {
    const impactZ = -7.2;
    expect(checkpointShatterProgress(impactZ - 0.01, impactZ)).toBe(0);
    expect(checkpointShatterProgress(impactZ, impactZ)).toBe(0);
    expect(
      checkpointShatterProgress(
        impactZ + VISION_RIDE_MILE_MARKER.shatterDistanceMetres / 2,
        impactZ,
      ),
    ).toBeCloseTo(0.5, 9);
    expect(
      checkpointShatterProgress(
        impactZ + VISION_RIDE_MILE_MARKER.shatterDistanceMetres + 1,
        impactZ,
      ),
    ).toBe(1);
  });
});
