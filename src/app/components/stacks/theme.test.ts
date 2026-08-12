import { describe, expect, it } from "vitest";

import { PALETTES } from "./theme";

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

describe("Stacks light sky grade", () => {
  it("moves from a warm horizon to a distinctly blue upper vault", () => {
    const [topR, , topB] = rgb(PALETTES.light.skyTop);
    const [horizonR, , horizonB] = rgb(PALETTES.light.skyHorizon);

    expect(topB - topR).toBeGreaterThan(120);
    expect(horizonR - horizonB).toBeGreaterThan(30);
    expect(topB).toBeGreaterThan(horizonB);
    expect(horizonR).toBeGreaterThan(topR);
  });

  it("keeps fog in the warm eye-level family instead of the blue cap", () => {
    const [fogR, , fogB] = rgb(PALETTES.light.fog);
    expect(fogR).toBeGreaterThan(fogB);
  });
});
