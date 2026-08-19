import { describe, expect, it } from "vitest";

import { SKY_LIGHTING } from "./skyLighting";

const fract = (value: number) => value - Math.floor(value);
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smooth = (value: number) => value * value * (3 - 2 * value);
const smoothstep = (start: number, end: number, value: number) =>
  smooth(Math.max(0, Math.min(1, (value - start) / (end - start))));

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

function cloudField(
  localAzimuth: number,
  pan: number,
  elevation: number,
  simplified = false,
) {
  const a = localAzimuth + pan;
  const x = a * 2.6;
  const y = elevation * 9.1;
  const primary =
    0.54 * vnoise(x, y) +
    0.29 * vnoise(x * 2.1 + 19, y * 2.1 + 19) +
    0.17 * vnoise(x * 4.3 + 7, y * 4.3 + 7);
  const seed = SKY_LIGHTING.atmosphere.cloudCoverageSeed;
  const coverage =
    0.62 *
      vnoise(
        localAzimuth * SKY_LIGHTING.atmosphere.cloudCoverageAzimuth[0] + seed,
        elevation * SKY_LIGHTING.atmosphere.cloudCoverageElevation[0] +
          seed * 0.37,
      ) +
    0.38 *
      vnoise(
        localAzimuth * SKY_LIGHTING.atmosphere.cloudCoverageAzimuth[1] -
          seed * 0.61,
        elevation * SKY_LIGHTING.atmosphere.cloudCoverageElevation[1] +
          11 +
          seed * 0.19,
      );
  const coverageField = coverage * SKY_LIGHTING.atmosphere.cloudCoverageScale;
  return simplified ? coverageField : Math.max(primary, coverageField);
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
      0.46,
    );
    expect(SKY_LIGHTING.atmosphere.cloudDensityGate[1]).toBeLessThanOrEqual(
      0.72,
    );
    const minimumBodyContrast =
      (1 - SKY_LIGHTING.atmosphere.cloudBodyShade[1]) *
      SKY_LIGHTING.atmosphere.cloudBodyOpacity;
    expect(minimumBodyContrast).toBeGreaterThanOrEqual(0.09);
    expect(SKY_LIGHTING.atmosphere.cloudBodyOpacity).toBeLessThanOrEqual(0.85);
    expect(SKY_LIGHTING.atmosphere.cloudRimSun).toBeLessThanOrEqual(0.4);
    expect(SKY_LIGHTING.atmosphere.cloudDrift).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.cloudDrift).toBeLessThanOrEqual(0.015);
    expect(SKY_LIGHTING.atmosphere.cloudMorph).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.cloudMorph).toBeLessThanOrEqual(0.006);
    expect(SKY_LIGHTING.atmosphere.cloudCoverageDrift).toBeGreaterThan(0);
    expect(SKY_LIGHTING.atmosphere.cloudCoverageScale).toBeGreaterThanOrEqual(
      0.85,
    );
    expect(SKY_LIGHTING.atmosphere.cloudCoverageScale).toBeLessThanOrEqual(1);
    expect(SKY_LIGHTING.atmosphere.horizonEmber).toBeLessThanOrEqual(0.04);
    expect(SKY_LIGHTING.atmosphere.emberMix).toBeLessThanOrEqual(0.45);
    expect(SKY_LIGHTING.atmosphere.emberLift).toBeLessThanOrEqual(1.05);
    expect(SKY_LIGHTING.atmosphere.karlBase).toBeLessThanOrEqual(0.02);
    expect(SKY_LIGHTING.atmosphere.karlOpacity).toBeLessThanOrEqual(0.2);
  });

  it("keeps a legible cloud deck across every traverse unit", () => {
    for (const simplified of [false, true]) {
      for (let unit = 0; unit < 7; unit++) {
        const pan = (unit / 6) * 0.6 - 0.25;
        let visible = 0;
        let opacity = 0;
        const horizontalSamples = 201;
        const verticalSamples = 81;
        for (let y = 0; y < verticalSamples; y++) {
          const elevation = 0.07 + (y / (verticalSamples - 1)) * 0.2;
          const deck =
            smoothstep(
              SKY_LIGHTING.atmosphere.cloudDeckFadeIn[0],
              SKY_LIGHTING.atmosphere.cloudDeckFadeIn[1],
              elevation,
            ) *
            (1 - smoothstep(0.17, 0.27, elevation));
          for (let x = 0; x < horizontalSamples; x++) {
            const localAzimuth = -2.25 + (x / (horizontalSamples - 1)) * 1.4;
            const density = smoothstep(
              SKY_LIGHTING.atmosphere.cloudDensityGate[0],
              SKY_LIGHTING.atmosphere.cloudDensityGate[1],
              cloudField(localAzimuth, pan, elevation, simplified),
            );
            const cloudOpacity = density * deck;
            opacity += cloudOpacity;
            if (cloudOpacity > 0.15) visible++;
          }
        }
        const samples = horizontalSamples * verticalSamples;
        expect(opacity / samples).toBeGreaterThanOrEqual(0.09);
        expect(visible / samples).toBeGreaterThanOrEqual(0.16);
        expect(visible / samples).toBeLessThanOrEqual(0.4);
      }
    }
  });
});
