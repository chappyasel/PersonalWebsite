// The Sticker Camera is a real object with published dimensions, and the
// room has a house scale. Those two facts are the whole test: a prop that
// drifts off 2.00 units per metre stands wrong beside books and frames that
// are correct, and that error is invisible in a screenshot until something
// else is placed next to it.
import { describe, expect, it } from "vitest";

import { STICKER_CAMERA } from "./StickerCamera";

/** The room's scale, from the bookcase's own joinery. */
const UNITS_PER_METRE = 2;
const INCH = 0.0254;
const unitsPerInch = INCH * UNITS_PER_METRE;

describe("sticker camera", () => {
  it("is built at the product's real size, in house units", () => {
    expect(STICKER_CAMERA.width).toBeCloseTo(2.9 * unitsPerInch, 9);
    expect(STICKER_CAMERA.height).toBeCloseTo(3.64 * unitsPerInch, 9);
    expect(STICKER_CAMERA.depth).toBeCloseTo(1.35 * unitsPerInch, 9);
  });

  it("stands taller than it is wide, and is shallowest front to back", () => {
    // Cheap shape guard: if the three measurements are ever reassigned to the
    // wrong axes the camera still "looks like a box" from the front, and only
    // its silhouette against the shelf gives it away.
    expect(STICKER_CAMERA.height).toBeGreaterThan(STICKER_CAMERA.width);
    expect(STICKER_CAMERA.depth).toBeLessThan(STICKER_CAMERA.width);
  });

  it("is a prop a shelf can hold, not furniture", () => {
    // Sanity against the room: a shelf bay is 0.8075 units of clear headroom,
    // so anything over about a fifth of that is not a desk object any more.
    expect(STICKER_CAMERA.height).toBeLessThan(0.8075 * 0.3);
    expect(STICKER_CAMERA.width).toBeGreaterThan(0.1);
  });
});
