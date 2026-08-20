import { describe, expect, it } from "vitest";

import { DAYLIGHT_RENDERING } from "./daylightRendering";

describe("Stacks daylight rendering balance", () => {
  it("keeps aerial perspective below the point that erases the skyline", () => {
    expect(DAYLIGHT_RENDERING.skylineHaze).toBeGreaterThanOrEqual(0.12);
    expect(DAYLIGHT_RENDERING.skylineHaze).toBeLessThanOrEqual(0.2);
  });

  it("keeps broad fill below the directional key", () => {
    const [hemiEarly, hemiLate] = DAYLIGHT_RENDERING.hemisphereIntensity;
    const [keyEarly, keyLate] = DAYLIGHT_RENDERING.directionalIntensity;

    expect(DAYLIGHT_RENDERING.environmentIntensity).toBeLessThanOrEqual(0.3);
    expect(hemiEarly).toBeLessThan(keyEarly);
    expect(hemiLate).toBeLessThan(keyLate);
    expect(hemiLate).toBeLessThanOrEqual(0.8);
  });

  it("does not apply the photographic warm grade to app screenshots", () => {
    expect(DAYLIGHT_RENDERING.projectImageGrade).toBeLessThanOrEqual(0.03);
  });

  it("keeps the Golden Gate darker and less hazed than the sky behind it", () => {
    const [r, g, b] = DAYLIGHT_RENDERING.goldenGatePaintLinear;
    const paintLuminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    expect(paintLuminance).toBeGreaterThanOrEqual(0.1);
    expect(paintLuminance).toBeLessThanOrEqual(0.14);
    expect(DAYLIGHT_RENDERING.goldenGateDayPaintMix).toBeGreaterThanOrEqual(
      0.55,
    );
    expect(DAYLIGHT_RENDERING.goldenGateDayPaintMix).toBeLessThanOrEqual(0.7);
    expect(DAYLIGHT_RENDERING.goldenGateDayHazeScale).toBeGreaterThanOrEqual(
      0.6,
    );
    expect(DAYLIGHT_RENDERING.goldenGateDayHazeScale).toBeLessThanOrEqual(0.9);
    expect(DAYLIGHT_RENDERING.goldenGateDayExtraHaze).toBe(0);
  });

  it("keeps the Washington clouds light while preserving a faint reflection", () => {
    const dc = DAYLIGHT_RENDERING.washington;
    const minimumWaterCloudContrast =
      (1 - dc.waterCloudShade[1]) * dc.waterCloudReflection;

    expect(dc.cloudBodyShade[0]).toBeGreaterThanOrEqual(0.9);
    expect(dc.cloudBodyLightMix).toBeGreaterThanOrEqual(0.3);
    expect(minimumWaterCloudContrast).toBeGreaterThanOrEqual(0.014);
    expect(dc.cloudBodyOpacity).toBeGreaterThanOrEqual(0.45);
    expect(dc.cloudBodyOpacity).toBeLessThanOrEqual(0.6);
    expect(dc.cloudRimOpacity).toBeGreaterThan(0);
    expect(dc.cloudRimOpacity).toBeLessThanOrEqual(0.08);
    expect(dc.waterCloudReflection).toBeGreaterThanOrEqual(0.15);
    expect(dc.waterCloudReflection).toBeLessThanOrEqual(0.4);
    expect(dc.waterFacetContrast).toBeGreaterThanOrEqual(0.02);
    expect(dc.waterFacetContrast).toBeLessThanOrEqual(0.06);
    expect(dc.waterTint[1]).toBeLessThanOrEqual(0.35);
  });
});
