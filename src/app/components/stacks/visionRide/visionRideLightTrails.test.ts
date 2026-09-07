import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_LIGHT_TRAIL,
  lightRibbonExposureSeconds,
  lightRibbonPresentation,
  lightRibbonShouldRetainSample,
  lightTrailCarPose,
  lightTrailRestAnchor,
  lightTrailSpeedStretch,
} from "./visionRideLightTrails";

const motion = {
  weaveRate: 0.8,
  weaveAmount: 0.32,
  bounceRate: 5.2,
  bounceAmount: 0.035,
  rollRate: 1.4,
  rollAmount: 0.012,
};

const sample = {
  x: 0.2,
  y: -0.25,
  capturedAtSeconds: 10,
  travelDistanceMetres: 100,
};

describe("Vision ride light ribbons", () => {
  it("uses the calibrated rear-lamp centers", () => {
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalX).toBeCloseTo(0.684, 9);
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalY).toBeCloseTo(0.76, 9);
    expect(VISION_RIDE_LIGHT_TRAIL.lampLocalZ).toBeCloseTo(-2.11, 9);
    const left = lightTrailRestAnchor(-1);
    const right = lightTrailRestAnchor(1);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.y).toBeCloseTo(0.795, 9);
    expect(left.z).toBeCloseTo(-2.69, 9);
  });

  it("carries the same weave, bounce, and roll as the car", () => {
    const pose = lightTrailCarPose({ time: 8, motion });
    expect(pose.x).toBeCloseTo(
      Math.sin(8 * motion.weaveRate) * motion.weaveAmount,
      9,
    );
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.roll).not.toBe(0);
  });

  it("lets speed extend exposure without changing its brightness plateau", () => {
    expect(lightTrailSpeedStretch(0.25)).toBeCloseTo(0.72, 9);
    expect(lightTrailSpeedStretch(1)).toBe(1);
    expect(lightTrailSpeedStretch(4)).toBeCloseTo(1.44, 9);
    expect(lightRibbonExposureSeconds(4)).toBeGreaterThan(
      lightRibbonExposureSeconds(0.25),
    );
    const slow = lightRibbonPresentation({
      sample,
      nowSeconds: 10.5,
      travelDistanceMetres: 110,
      speedMultiplier: 0.25,
      vanishingPointNdcX: 0,
    });
    const fast = lightRibbonPresentation({
      sample,
      nowSeconds: 10.5,
      travelDistanceMetres: 110,
      speedMultiplier: 4,
      vanishingPointNdcX: 0,
    });
    expect(slow.opacity).toBe(1);
    expect(fast.opacity).toBe(1);
  });

  it("keeps enough camera history for the full four-times-speed exposure", () => {
    const bufferedSeconds =
      VISION_RIDE_LIGHT_TRAIL.samplesPerLamp *
      VISION_RIDE_LIGHT_TRAIL.sampleIntervalSeconds;
    expect(VISION_RIDE_LIGHT_TRAIL.baseExposureSeconds).toBeGreaterThanOrEqual(
      2.5,
    );
    expect(bufferedSeconds).toBeGreaterThanOrEqual(
      lightRibbonExposureSeconds(4),
    );
  });

  it("keeps the source silhouette compact and bends its history downward", () => {
    expect(VISION_RIDE_LIGHT_TRAIL.emitterHalfWidthMetres).toBeCloseTo(
      0.145,
      9,
    );
    expect(VISION_RIDE_LIGHT_TRAIL.emitterHalfHeightMetres).toBeCloseTo(
      0.055,
      9,
    );
    expect(VISION_RIDE_LIGHT_TRAIL.verticalDropNdc).toBeCloseTo(0.24, 9);
  });

  it("detaches the visible ribbon from its newest invisible sample", () => {
    const newest = lightRibbonPresentation({
      sample,
      nowSeconds: 10,
      travelDistanceMetres: 100,
      speedMultiplier: 1,
      vanishingPointNdcX: 0,
    });
    const visible = lightRibbonPresentation({
      sample,
      nowSeconds: 10.2,
      travelDistanceMetres: 104,
      speedMultiplier: 1,
      vanishingPointNdcX: 0,
    });
    expect(newest.opacity).toBe(0);
    expect(visible.opacity).toBe(1);
    expect(visible.x).toBeGreaterThan(sample.x);
    expect(visible.y).toBeLessThan(sample.y);
  });

  it("pulls the terminal exposure beyond the bottom of the frame", () => {
    const exposure = lightRibbonExposureSeconds(0.25);
    const ending = lightRibbonPresentation({
      sample,
      nowSeconds: sample.capturedAtSeconds + exposure * 0.99,
      travelDistanceMetres: sample.travelDistanceMetres,
      speedMultiplier: 0.25,
      vanishingPointNdcX: 0,
    });
    expect(ending.y).toBeLessThan(-1);
    expect(ending.scale).toBeLessThanOrEqual(
      VISION_RIDE_LIGHT_TRAIL.maximumEmitterScale,
    );
  });

  it("clears the full bloomed silhouette before its steady section ends", () => {
    const exposure = lightRibbonExposureSeconds(1);
    for (const offscreenMarginNdc of [0, 0.12, 0.3]) {
      const result = lightRibbonPresentation({
        sample: { ...sample, y: -0.05 },
        nowSeconds:
          sample.capturedAtSeconds +
          exposure * VISION_RIDE_LIGHT_TRAIL.offscreenProgress,
        travelDistanceMetres: sample.travelDistanceMetres,
        speedMultiplier: 1,
        vanishingPointNdcX: 0,
        offscreenMarginNdc,
      });
      expect(result.opacity).toBe(1);
      expect(result.y).toBeLessThanOrEqual(
        -1 - VISION_RIDE_LIGHT_TRAIL.offscreenOverscanNdc - offscreenMarginNdc,
      );
    }
  });

  it("holds luminosity steady until a short terminal feather", () => {
    const exposure = lightRibbonExposureSeconds(1);
    for (const fraction of [0.1, 0.25, 0.5, 0.75]) {
      const result = lightRibbonPresentation({
        sample,
        nowSeconds: sample.capturedAtSeconds + exposure * fraction,
        travelDistanceMetres: 112,
        speedMultiplier: 1,
        vanishingPointNdcX: 0,
      });
      expect(result.opacity).toBe(1);
    }
    const ending = lightRibbonPresentation({
      sample,
      nowSeconds: sample.capturedAtSeconds + exposure * 0.95,
      travelDistanceMetres: 112,
      speedMultiplier: 1,
      vanishingPointNdcX: 0,
    });
    expect(ending.opacity).toBeGreaterThan(0);
    expect(ending.opacity).toBeLessThan(1);
  });

  it("expires history according to the speed-scaled exposure", () => {
    const exposure = lightRibbonExposureSeconds(1);
    expect(
      lightRibbonShouldRetainSample({
        sample,
        nowSeconds: sample.capturedAtSeconds + exposure,
        speedMultiplier: 1,
      }),
    ).toBe(true);
    expect(
      lightRibbonShouldRetainSample({
        sample,
        nowSeconds: sample.capturedAtSeconds + exposure + 0.001,
        speedMultiplier: 1,
      }),
    ).toBe(false);
  });
});
