import { describe, expect, it } from "vitest";

import {
  touchSwipeDestination,
  touchSwipeScrollBounds,
} from "./swipeTravel";

const stops = [
  { position: 0, scrollLeft: 0 },
  { position: 1, scrollLeft: 390 },
  { position: 1.5, scrollLeft: 585 },
  { position: 2, scrollLeft: 780 },
  { position: 3, scrollLeft: 1170 },
  { position: 4, scrollLeft: 1560 },
  { position: 5, scrollLeft: 1950 },
];

describe("phone shelf swipes", () => {
  it("advances after a short deliberate swipe without requiring half a screen", () => {
    expect(
      touchSwipeDestination({
        startScrollLeft: 390,
        endScrollLeft: 430,
        stops,
      }),
    ).toBe(1.5);
    expect(
      touchSwipeDestination({
        startScrollLeft: 390,
        endScrollLeft: 350,
        stops,
      }),
    ).toBe(0);
  });

  it("keeps small finger drift at the nearest shelf", () => {
    expect(
      touchSwipeDestination({
        startScrollLeft: 390,
        endScrollLeft: 410,
        stops,
      }),
    ).toBe(1);
  });

  it("caps one swipe at three authored stops in either direction", () => {
    expect(
      touchSwipeDestination({
        startScrollLeft: 0,
        endScrollLeft: 1950,
        stops,
      }),
    ).toBe(2);
    expect(
      touchSwipeDestination({
        startScrollLeft: 1950,
        endScrollLeft: 0,
        stops,
      }),
    ).toBe(2);
  });

  it("exposes the same limit for clamping live native momentum", () => {
    expect(
      touchSwipeScrollBounds({ startScrollLeft: 780, stops }),
    ).toEqual({ min: 0, max: 1950 });
    expect(
      touchSwipeScrollBounds({ startScrollLeft: 1560, stops }),
    ).toEqual({ min: 585, max: 1950 });
  });
});
