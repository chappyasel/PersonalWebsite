import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_PALETTE,
  VISION_RIDE_REFERENCE_SRGB,
  glslVec3,
  surfaceColorAtViewportY,
  surfaceFogWeight,
  surfaceGradientWeight,
} from "./visionRidePalette";

describe("Vision ride palette", () => {
  it("pins the sampled display-space colours from the supplied reference", () => {
    expect(VISION_RIDE_REFERENCE_SRGB).toEqual({
      skyTop: [4, 7, 28],
      skyUpper: [97, 0, 105],
      skyViolet: [140, 0, 125],
      skyMagenta: [179, 1, 136],
      skyPink: [216, 1, 137],
      skyCoral: [246, 13, 126],
      horizonOrange: [255, 150, 83],
      sunTop: [247, 254, 52],
      sunMiddle: [244, 168, 153],
      sunFoot: [226, 17, 236],
      mountainFill: [20, 12, 66],
      roadNear: [61, 2, 84],
    });
  });

  it("authors the horizon as saturated orange-red, not pale yellow", () => {
    for (const [r, g, b] of [
      VISION_RIDE_PALETTE.skyHorizon,
      VISION_RIDE_PALETTE.skyHorizonCrest,
    ]) {
      expect(r).toBeGreaterThanOrEqual(0.95);
      // Yellow needs green near red; coral keeps it under a third.
      expect(g / r).toBeLessThanOrEqual(0.35);
      expect(g / r).toBeGreaterThanOrEqual(0.1);
      expect(b).toBeLessThanOrEqual(0.2);
    }
    // The crest is warmer than the base, never cooler.
    expect(VISION_RIDE_PALETTE.skyHorizonCrest[1]).toBeGreaterThan(
      VISION_RIDE_PALETTE.skyHorizon[1],
    );
  });

  it("runs the sun from electric yellow through peach to hot pink", () => {
    const [top, middle, foot] = [
      VISION_RIDE_PALETTE.sunTop,
      VISION_RIDE_PALETTE.sunMiddle,
      VISION_RIDE_PALETTE.sunFoot,
    ];
    expect(top[0]).toBeGreaterThan(0.9);
    expect(top[1]).toBeGreaterThan(0.9);
    expect(top[2]).toBeLessThan(0.1);
    expect(middle[0]).toBeGreaterThan(middle[1]);
    expect(middle[1]).toBeGreaterThan(middle[2]);
    expect(foot[2]).toBeGreaterThan(foot[0]);
    expect(foot[1]).toBeLessThan(0.02);
  });

  it("uses one viewport gradient for road and mountain fills", () => {
    expect(surfaceGradientWeight(0)).toBe(1);
    expect(surfaceGradientWeight(1)).toBe(0);
    let previous = surfaceGradientWeight(0);
    for (let step = 1; step <= 100; step += 1) {
      const weight = surfaceGradientWeight(step / 100);
      expect(weight).toBeLessThanOrEqual(previous);
      previous = weight;
    }
    const bottom = surfaceColorAtViewportY(0);
    const upper = surfaceColorAtViewportY(1);
    expect(bottom).toEqual(VISION_RIDE_PALETTE.surfaceBottom);
    expect(upper).toEqual(VISION_RIDE_PALETTE.surfaceBase);
    expect(bottom[0]).toBeGreaterThan(upper[0] * 2.5);
    expect(bottom[2]).toBeGreaterThan(upper[2]);
    expect(bottom[1]).toBeLessThan(upper[1]);
    surfaceColorAtViewportY(0.42).forEach((channel, index) =>
      expect(channel).toBeCloseTo(surfaceColorAtViewportY(0.42)[index]!, 9),
    );
  });

  it("holds magenta at the frame foot and reaches the dark base above mid-frame", () => {
    const { surfaceGradientBottom, surfaceGradientTop } = VISION_RIDE_PALETTE;
    expect(surfaceGradientBottom).toBeGreaterThanOrEqual(0);
    expect(surfaceGradientBottom).toBeLessThan(0.15);
    expect(surfaceGradientTop).toBeGreaterThan(0.55);
    expect(surfaceGradientTop).toBeLessThanOrEqual(0.75);
    expect(surfaceGradientWeight(surfaceGradientBottom)).toBe(1);
    expect(surfaceGradientWeight(surfaceGradientTop)).toBe(0);
  });

  it("fogs the unified surface only in the far field", () => {
    const { surfaceFogNear, surfaceFogFar, surfaceFogMax } =
      VISION_RIDE_PALETTE;
    expect(surfaceFogNear).toBeGreaterThan(50);
    expect(surfaceFogFar).toBeGreaterThan(surfaceFogNear);
    expect(surfaceFogMax).toBe(1);
    expect(surfaceFogWeight(surfaceFogNear - 1)).toBe(0);
    expect(surfaceFogWeight(surfaceFogFar)).toBeCloseTo(surfaceFogMax, 6);
    expect(surfaceFogWeight(surfaceFogFar + 100)).toBeCloseTo(surfaceFogMax, 6);
  });

  it("keeps the wire cyan-blue", () => {
    const [r, g, b] = VISION_RIDE_PALETTE.roadLine;
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThanOrEqual(0.9);
  });

  it("emits GLSL literals with fixed precision", () => {
    expect(glslVec3([1, 0.26, 0.1])).toBe("vec3(1.000, 0.260, 0.100)");
  });
});
