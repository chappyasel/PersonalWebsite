import { describe, expect, it } from "vitest";

import {
  MEADOW_POKE,
  MEADOW_WIND,
  limitMeadowWind,
  meadowDragSample,
  meadowPulseState,
  meadowWindAudioLevel,
} from "./meadowMotion";

describe("meadow pointer motion", () => {
  it("keeps ambient wind clearly visible without allowing runaway gusts", () => {
    expect(MEADOW_WIND.amplitude).toBeGreaterThanOrEqual(0.13);
    expect(MEADOW_WIND.gustKnee).toBeLessThan(MEADOW_WIND.gustCeiling);
    expect(MEADOW_WIND.gustCeiling).toBeLessThan(MEADOW_WIND.maxLean);
    expect(limitMeadowWind(0.15)).toBe(0.15);
    expect(limitMeadowWind(10)).toBeLessThanOrEqual(MEADOW_WIND.gustCeiling);
    const revealPeak =
      MEADOW_WIND.amplitude * (1 + MEADOW_WIND.bootBoost) * 1.45;
    expect(limitMeadowWind(revealPeak)).toBeLessThan(MEADOW_WIND.gustCeiling);
  });

  it("exposes the same normalized amplitude to the ambient audio bed", () => {
    const baseline = meadowWindAudioLevel(MEADOW_WIND.amplitude);
    const reveal = meadowWindAudioLevel(
      MEADOW_WIND.amplitude * (1 + MEADOW_WIND.bootBoost),
    );
    expect(baseline).toBeCloseTo(0.56, 4);
    expect(reveal).toBeGreaterThan(baseline);
    expect(meadowWindAudioLevel(MEADOW_WIND.gustCeiling)).toBe(1);
  });

  it("keeps each interaction below the shader's hard lean clamp at peak wind", () => {
    // windAt's gust/breeze envelope tops out at 0.35 + 0.85 + 0.25.
    const peakWind = MEADOW_WIND.amplitude * 1.45;
    const quietedWind = peakWind * (1 - MEADOW_POKE.windSuppression);
    expect(quietedWind + MEADOW_POKE.hoverStrength).toBeLessThanOrEqual(
      MEADOW_WIND.maxLean,
    );
    expect(quietedWind + meadowPulseState(0, 1).strength).toBeLessThanOrEqual(
      MEADOW_WIND.maxLean,
    );
  });

  it("uses a tight, responsive brush that stays under the cursor", () => {
    const oneFrameFollow = 1 - Math.exp(-MEADOW_POKE.grassPositionLambda / 60);
    expect(MEADOW_POKE.radius).toBeLessThanOrEqual(0.6);
    expect(MEADOW_POKE.hoverStrength).toBeGreaterThanOrEqual(0.18);
    expect(MEADOW_POKE.dragSpeedScale).toBeLessThanOrEqual(1.7);
    expect(oneFrameFollow).toBeGreaterThanOrEqual(0.08);
    expect(oneFrameFollow).toBeLessThanOrEqual(0.12);
  });

  it("keeps the pointer response visibly distinct from the ambient wind", () => {
    expect(MEADOW_POKE.hoverStrength).toBeGreaterThanOrEqual(0.18);
    expect(meadowPulseState(0, 1).strength).toBeGreaterThanOrEqual(0.16);
  });

  it("launches a fast outward shockwave at full force that only fades", () => {
    const start = meadowPulseState(0, 1);
    const early = meadowPulseState(MEADOW_POKE.pulseDuration * 0.15, 1);
    const middle = meadowPulseState(MEADOW_POKE.pulseDuration / 2, 1);
    const end = meadowPulseState(MEADOW_POKE.pulseDuration, 1);
    expect(start.radius).toBeLessThanOrEqual(0.2);
    expect(start.strength).toBe(MEADOW_POKE.clickStrength);
    expect(start.strength).toBeGreaterThan(early.strength);
    expect(early.strength).toBeGreaterThan(middle.strength);
    expect(end.strength).toBe(0);
    expect(early.radius - start.radius).toBeGreaterThan(
      (end.radius - start.radius) * 0.35,
    );
    expect(start.radius).toBeLessThan(middle.radius);
    expect(middle.radius).toBeLessThan(end.radius);
  });

  it("brushes grass in the mouse travel direction instead of repelling it", () => {
    expect(meadowDragSample(0, 0, 2, -1, 0.5, 1)).toMatchObject({
      directionX: 2 / Math.sqrt(5),
      directionZ: -1 / Math.sqrt(5),
    });
    expect(meadowDragSample(0, 0, 2, -1, 0.5, 1).strength).toBeGreaterThan(0);
    expect(meadowDragSample(2, -1, 2, -1, 0.5, 1).strength).toBe(0);
  });
});
