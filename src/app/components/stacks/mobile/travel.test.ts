import { describe, expect, it } from "vitest";

import {
  authoredTravelStops,
  clampWorldZoom,
  nearestAuthoredStop,
  projectedInertiaDistance,
  unitForScrollPosition,
  worldZoomFromVerticalDrag,
} from "./travel";

describe("kinetic snapping", () => {
  it("selects and bounds the nearest authored stop", () => {
    expect(nearestAuthoredStop(2.49, 7)).toBe(2);
    expect(nearestAuthoredStop(2.5, 7)).toBe(3);
    expect(nearestAuthoredStop(-2, 7)).toBe(0);
    expect(nearestAuthoredStop(9, 7)).toBe(6);
    expect(unitForScrollPosition(500, 1100, 100, 7)).toBe(3);
  });

  it("allows bounded momentum to cross multiple units", () => {
    expect(projectedInertiaDistance(1.2)).toBeGreaterThan(200);
  });

  it("includes optional authored stops and caps visitor zoom", () => {
    expect(authoredTravelStops(4, [1.6])).toEqual([0, 1, 1.6, 2, 3]);
    expect(worldZoomFromVerticalDrag(0, -100)).toBe(0.65);
    expect(worldZoomFromVerticalDrag(0, -1000)).toBe(5.5);
    expect(clampWorldZoom(-10)).toBe(-0.75);
  });
});
