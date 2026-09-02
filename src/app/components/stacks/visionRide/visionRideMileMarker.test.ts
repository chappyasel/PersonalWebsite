import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_MILE_MARKER,
  mileMarkerDigitSegments,
  mileMarkerPresentation,
} from "./visionRideMileMarker";

describe("Vision ride mile marker", () => {
  it("stays absent until the first 30-second crossing", () => {
    expect(mileMarkerPresentation(29.99, 12, false).visible).toBe(false);
    const arriving = mileMarkerPresentation(30, 12, false);
    expect(arriving).toMatchObject({ visible: true, number: 1 });
    expect(arriving.z).toBe(
      VISION_RIDE_MILE_MARKER.nearZ - 12 * VISION_RIDE_MILE_MARKER.passSeconds,
    );
  });

  it("crosses at road speed, disappears, and returns with the next number", () => {
    const start = mileMarkerPresentation(60, 18, false);
    const middle = mileMarkerPresentation(63, 18, false);
    const passed = mileMarkerPresentation(66.01, 18, false);
    expect(start.number).toBe(2);
    expect(middle.z - start.z).toBeCloseTo(18 * 3, 9);
    expect(passed.visible).toBe(false);
    expect(mileMarkerPresentation(90, 18, false).number).toBe(3);
  });

  it("renders two seven-segment digits and remains absent under reduced motion", () => {
    expect(mileMarkerDigitSegments(1)).toEqual(["abcdef", "bc"]);
    expect(mileMarkerDigitSegments(42)).toEqual(["bcfg", "abdeg"]);
    expect(mileMarkerPresentation(60, 12, true).visible).toBe(false);
  });
});
