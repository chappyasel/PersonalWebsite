import { describe, expect, it } from "vitest";

import {
  KATAMA_HOME_CUTOUT_POINT,
  KATAMA_HOME_ISLAND_POINT,
  MUSINGS_VINEYARD_CUTOUT_POSE,
  vineyardSurfacePoint,
} from "./VineyardCutout";
import { VINEYARD_OUTLINE } from "./vineyardOutline";

function pointInsideOutline(point: readonly [number, number]) {
  let inside = false;
  for (
    let current = 0, previous = VINEYARD_OUTLINE.length - 1;
    current < VINEYARD_OUTLINE.length;
    previous = current++
  ) {
    const [currentX, currentY] = VINEYARD_OUTLINE[current]!;
    const [previousX, previousY] = VINEYARD_OUTLINE[previous]!;
    const crosses =
      currentY > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

describe("Martha's Vineyard home pin", () => {
  it("places the Katama home pin inside the southeast coast", () => {
    expect(pointInsideOutline(KATAMA_HOME_ISLAND_POINT)).toBe(true);
    expect(KATAMA_HOME_ISLAND_POINT[0]).toBeGreaterThan(0.3);
    expect(KATAMA_HOME_ISLAND_POINT[1]).toBeLessThan(-0.1);
  });

  it("follows the cutout's authored scale and roll", () => {
    expect(KATAMA_HOME_CUTOUT_POINT).toEqual(
      vineyardSurfacePoint(
        KATAMA_HOME_ISLAND_POINT,
        MUSINGS_VINEYARD_CUTOUT_POSE.width,
        MUSINGS_VINEYARD_CUTOUT_POSE.roll,
      ),
    );
    expect(KATAMA_HOME_CUTOUT_POINT[0]).toBeCloseTo(0.138, 3);
    expect(KATAMA_HOME_CUTOUT_POINT[1]).toBeCloseTo(0.0325, 3);
  });
});
