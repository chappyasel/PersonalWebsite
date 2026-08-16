import { describe, expect, it } from "vitest";

import { claimEffectLayer, effectLayerAges } from "./layeredEffects";

describe("layered scene effects", () => {
  it("keeps successive triggers alive in separate slots", () => {
    const starts = [-1, -1, -1];

    expect(claimEffectLayer(starts, 0, 10)).toBe(0);
    expect(claimEffectLayer(starts, 0.25, 10)).toBe(1);
    expect(effectLayerAges(starts, 1, 10)).toEqual([1, 0.75, -1]);
  });

  it("does not collapse triggers that arrive before the next frame", () => {
    const starts = [-1, -1, -1];

    expect(claimEffectLayer(starts, 2, 10)).toBe(0);
    expect(claimEffectLayer(starts, 2, 10)).toBe(1);
    expect(claimEffectLayer(starts, 2, 10)).toBe(2);
    expect(effectLayerAges(starts, 2.5, 10)).toEqual([0.5, 0.5, 0.5]);
  });

  it("reuses an expired slot before replacing the oldest live layer", () => {
    const starts = [1, 7, 8];

    expect(claimEffectLayer(starts, 12, 10)).toBe(0);
    expect(starts).toEqual([12, 7, 8]);
    expect(claimEffectLayer(starts, 13, 10)).toBe(1);
    expect(starts).toEqual([12, 13, 8]);
  });
});
