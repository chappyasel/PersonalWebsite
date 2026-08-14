import { describe, expect, it } from "vitest";

import { SKY_LIGHTING } from "./skyLighting";

const fract = (value: number) => value - Math.floor(value);
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smooth = (value: number) => value * value * (3 - 2 * value);

// Mirrors the sky shader's Hoskins hash and value noise. Sampling the actual
// traverse catches a cloud field that is technically dynamic but empty over
// the first units, which scalar range assertions cannot.
function hash2(x: number, y: number) {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += dot;
  py += dot;
  pz += dot;
  return fract((px + py) * pz);
}

function vnoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(fract(x));
  const fy = smooth(fract(y));
  return mix(
    mix(hash2(ix, iy), hash2(ix + 1, iy), fx),
    mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx),
    fy,
  );
}

function cloudField(localAzimuth: number, pan: number, elevation: number) {
  const a = localAzimuth + pan;
  const x = a * 2.6;
  const y = elevation * 9.1;
  const primary =
    0.54 * vnoise(x, y) +
    0.29 * vnoise(x * 2.1 + 19, y * 2.1 + 19) +
    0.17 * vnoise(x * 4.3 + 7, y * 4.3 + 7);
  const seed = SKY_LIGHTING.atmosphere.cloudCoverageSeed;
  const coverage =
    0.62 * vnoise(localAzimuth * 1.65 + seed, elevation * 7 + seed * 0.37) +
    0.38 *
      vnoise(
        localAzimuth * 3.8 - seed * 0.61,
        elevation * 14 + 11 + seed * 0.19,
      );
  return Math.max(
    primary,
    coverage * SKY_LIGHTING.atmosphere.cloudCoverageScale,
  );
}

describe("Stacks light-mode atmospheric lighting", () => {
  it("keeps Salesforce non-emissive by day until it is interactive", () => {
    expect(SKY_LIGHTING.salesforce.dayIdleEmission).toBe(0);
    expect(SKY_LIGHTING.salesforce.dayActiveEmission).toBeGreaterThan(0);
  });

  it("keeps visible clouds shaped without bleaching the SF sky", () => {
    expect(SKY_LIGHTING.atmosphere.cloudDeckFadeIn[0]).toBeGreaterThanOrEqual(
      0.06,
    );
    expect(SKY_LIGHTING.atmosphere.cloudDensityGate[0]).toBeGreaterThanOrEqual(
      0.5,
    );
    expect(SKY_LIGHTING.atmosphere.cloudBodyOpacity).toBeLessThanOrEqual(0.7);
    expect(SKY_LIGHTING.atmosphere.cloudRimSun).toBeLessThanOrEqual(0.2);
    expect(SKY_LIGHTING.atmosphere.cloudDrift).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.cloudDrift).toBeLessThanOrEqual(0.015);
    expect(SKY_LIGHTING.atmosphere.cloudMorph).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.cloudMorph).toBeLessThanOrEqual(0.006);
    expect(SKY_LIGHTING.atmosphere.cloudCoverageDrift).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.horizonEmber).toBeLessThanOrEqual(0.04);
    expect(SKY_LIGHTING.atmosphere.emberMix).toBeLessThanOrEqual(0.45);
    expect(SKY_LIGHTING.atmosphere.emberLift).toBeLessThanOrEqual(1.05);
    expect(SKY_LIGHTING.atmosphere.karlBase).toBeLessThanOrEqual(0.02);
    expect(SKY_LIGHTING.atmosphere.karlOpacity).toBeLessThanOrEqual(0.2);
  });

  it("keeps a sparse cloud presence across every traverse unit", () => {
    for (let unit = 0; unit < 7; unit++) {
      const pan = (unit / 6) * 0.6 - 0.25;
      let visible = 0;
      const samples = 201;
      for (let sample = 0; sample < samples; sample++) {
        const localAzimuth = -2.25 + (sample / (samples - 1)) * 1.4;
        if (cloudField(localAzimuth, pan, 0.14) > 0.5) visible++;
      }
      const coverage = visible / samples;
      expect(coverage).toBeGreaterThanOrEqual(0.08);
      expect(coverage).toBeLessThanOrEqual(0.45);
    }
  });
});
