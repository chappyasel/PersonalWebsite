import { describe, expect, it } from "vitest";

import { coordinationGlobeLegibility } from "./coordinationGlobeLegibility";

describe("Coordination globe low-resolution legibility", () => {
  it("keeps the resting web above one-pixel coverage at 0.5 megapixels", () => {
    const constrained = coordinationGlobeLegibility(0.5);

    expect(constrained.baseLineWidthPx).toBeGreaterThanOrEqual(1.3);
    expect(constrained.baseLineOpacity).toBeLessThanOrEqual(0.41);
  });

  it("rebudgets the 0.4-megapixel render instead of merely enlarging every mark", () => {
    const low = coordinationGlobeLegibility(0.4);
    const reference = coordinationGlobeLegibility(2);

    expect(low.baseLineOpacity).toBeGreaterThan(reference.baseLineOpacity);
    expect(low.baseLineOpacity).toBeLessThanOrEqual(0.41);
    expect(low.baseLineWidthPx).toBeGreaterThanOrEqual(1);
    expect(low.revealLineWidthPx).toBeLessThan(
      reference.revealLineWidthPx * 0.7,
    );
    expect(low.nodeScale).toBeGreaterThanOrEqual(reference.nodeScale * 1.4);
    expect(low.ditherCellPx).toBeLessThanOrEqual(reference.ditherCellPx * 0.55);
    expect(low.ditherBandCoverage).toBeGreaterThan(
      reference.ditherBandCoverage,
    );
  });

  it("returns the authored presentation at a full-resolution target", () => {
    expect(coordinationGlobeLegibility(2)).toEqual({
      baseLineOpacity: 0.27,
      baseLineWidthPx: 1,
      ditherBandCoverage: 0.7,
      ditherCellPx: 3.2,
      nodeScale: 1,
      revealLineWidthPx: 3.4,
    });
  });
});
