import { describe, expect, it } from "vitest";

import { PALETTES } from "./theme";

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("Stacks light sky grade", () => {
  it("moves from a pale-blue horizon to a distinctly bluer upper vault", () => {
    const [topR, , topB] = rgb(PALETTES.light.skyTop);
    const [horizonR, , horizonB] = rgb(PALETTES.light.skyHorizon);

    expect(topB - topR).toBeGreaterThan(150);
    expect(horizonB - horizonR).toBeGreaterThanOrEqual(100);
    expect(topB - topR).toBeGreaterThan(horizonB - horizonR);
    expect(horizonR).toBeGreaterThan(topR);
  });

  it("retains about half the top's blue contrast at eye level and in fog", () => {
    const [topR, , topB] = rgb(PALETTES.light.skyTop);
    const [shadowR, , shadowB] = rgb(PALETTES.light.skyShadow);
    const [fogR, , fogB] = rgb(PALETTES.light.fog);
    const lowerBlueRatio = (shadowB - shadowR) / (topB - topR);

    expect(lowerBlueRatio).toBeGreaterThan(0.45);
    expect(lowerBlueRatio).toBeLessThan(0.55);
    expect(fogB).toBeGreaterThan(fogR);
    expect(PALETTES.light.fog).toBe(PALETTES.light.skyShadow);
  });

  it("keeps the skyline darker than the air it recedes into", () => {
    const skylineLuminance = relativeLuminance(PALETTES.light.skyline);
    const hazeLuminance = relativeLuminance(PALETTES.light.skyShadow);

    expect(skylineLuminance).toBeLessThan(hazeLuminance * 0.55);
  });

  it("keeps the seated Washington sky blue and below the white shoulder", () => {
    const horizonLuminance = relativeLuminance(PALETTES.light.dcSkyHorizon);
    const shadowLuminance = relativeLuminance(PALETTES.light.dcSkyShadow);
    const waterLuminance = relativeLuminance(PALETTES.light.dcWater);
    const [horizonR, , horizonB] = rgb(PALETTES.light.dcSkyHorizon);

    expect(horizonLuminance).toBeLessThan(0.45);
    expect(horizonB - horizonR).toBeGreaterThanOrEqual(80);
    expect(waterLuminance).toBeLessThan(shadowLuminance * 0.7);
  });
});
