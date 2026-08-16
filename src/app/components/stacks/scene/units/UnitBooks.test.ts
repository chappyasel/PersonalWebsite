import { describe, expect, it } from "vitest";

import { featuredBookThickness } from "./featuredBookGeometry";

describe("featured book physical thickness", () => {
  it("is monotonic with printed length and clamps outliers", () => {
    const short = featuredBookThickness(120, null);
    const medium = featuredBookThickness(400, null);
    const long = featuredBookThickness(900, null);

    expect(short).toBeCloseTo(0.036, 8);
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeCloseTo(0.09, 8);
    expect(featuredBookThickness(2_000, null)).toBe(long);
  });

  it("uses audiobook runtime when a page count is unavailable", () => {
    expect(featuredBookThickness(null, 1_350)).toBeGreaterThan(
      featuredBookThickness(null, 360),
    );
  });
});
