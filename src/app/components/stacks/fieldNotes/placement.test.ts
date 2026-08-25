import { describe, expect, it } from "vitest";

import {
  normalizeFieldNotePlacement,
  parseFieldNotePlacements,
} from "./placement";

describe("Field Notes stamp placement", () => {
  it("keeps saved centers within the page", () => {
    expect(
      normalizeFieldNotePlacement({ placed: true, x: 4, y: -3, tilt: 9 }),
    ).toEqual({
      placed: true,
      x: 1,
      y: 0,
      tilt: 3,
    });
  });

  it("treats the old mount-offset shape as an unplaced stamp", () => {
    expect(normalizeFieldNotePlacement({ x: 0.08, y: -0.06, tilt: 1 })).toEqual(
      {
        placed: false,
        x: 0,
        y: 0,
        tilt: 0,
      },
    );
  });

  it("drops malformed and unknown saved placements", () => {
    expect(
      parseFieldNotePlacements(
        JSON.stringify({
          beacon: { placed: true, x: 0.84, y: 0.18, tilt: 0.6 },
          missing: { placed: true, x: 0.4, y: 0.5, tilt: 0 },
          "grand-tour": "up and to the left",
        }),
      ),
    ).toEqual({
      beacon: { placed: true, x: 0.84, y: 0.18, tilt: 0.6 },
    });
  });

  it("falls back to an empty arrangement when storage is corrupt", () => {
    expect(parseFieldNotePlacements("not json")).toEqual({});
  });
});
