import { describe, expect, it } from "vitest";

import {
  MEADOW_LAST_UNIT,
  meadowPokeStrength,
  shelfBackEdgeAt,
  shelfPokeFadeEndAt,
} from "./meadowInteraction";
import { UNIT_SPACING, unitPose } from "./worldLayout";

describe("meadow pointer reach", () => {
  it("fades across the final two-foot apron and stops beyond it", () => {
    for (let unit = 0; unit <= MEADOW_LAST_UNIT; unit += 1) {
      const [x] = unitPose(unit).position;
      const backEdge = shelfBackEdgeAt(x);
      const fadeEnd = shelfPokeFadeEndAt(x);

      expect(meadowPokeStrength(x, backEdge - 0.01)).toBeGreaterThan(0.99);
      expect(
        meadowPokeStrength(x, (backEdge + fadeEnd) / 2),
      ).toBeCloseTo(0.5, 5);
      expect(meadowPokeStrength(x, fadeEnd)).toBe(0);
      expect(meadowPokeStrength(x, backEdge - 4)).toBe(0);
    }
  });

  it("keeps the boundary continuous through every gap between shelves", () => {
    for (let unit = 0; unit < MEADOW_LAST_UNIT; unit += 1) {
      const midpoint = (unit + 0.5) * UNIT_SPACING;
      const epsilon = 0.0001;
      expect(
        Math.abs(
          shelfBackEdgeAt(midpoint - epsilon) -
            shelfBackEdgeAt(midpoint + epsilon),
        ),
      ).toBeLessThan(0.001);
    }
  });

  it("decreases smoothly and monotonically toward the far edge", () => {
    const x = unitPose(2).position[0];
    const backEdge = shelfBackEdgeAt(x);
    const fadeEnd = shelfPokeFadeEndAt(x);
    const samples = Array.from({ length: 21 }, (_, index) =>
      meadowPokeStrength(
        x,
        backEdge + ((fadeEnd - backEdge) * index) / 20,
      ),
    );

    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBe(0);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]!);
    }
  });
});
