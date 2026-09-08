import { describe, expect, it } from "vitest";

import {
  MEADOW_FLOWER_WIND,
  MEADOW_IMPACT,
  MEADOW_POKE,
  MEADOW_TRAIL,
  MEADOW_WIND,
  limitMeadowWind,
  meadowDragSample,
  meadowPhysicalResponse,
  meadowPulseState,
  meadowTrailReady,
  meadowWindAudioLevel,
  sampleMeadowGust,
  sampleMeadowWind,
} from "./meadowMotion";

describe("meadow pointer motion", () => {
  it("keeps ambient wind clearly visible without allowing runaway gusts", () => {
    expect(MEADOW_WIND.amplitude).toBe(0.21);
    expect(MEADOW_WIND.authoredMaxLean).toBe(0.36);
    expect(MEADOW_WIND.gustKnee).toBeLessThan(MEADOW_WIND.gustCeiling);
    expect(MEADOW_WIND.gustCeiling).toBeLessThan(MEADOW_WIND.maxLean);
    expect(limitMeadowWind(0.15)).toBe(0.15);
    expect(limitMeadowWind(10)).toBeLessThanOrEqual(MEADOW_WIND.gustCeiling);
    const peakEnvelope =
      1 + MEADOW_WIND.mainGustAmplitude * 2 + MEADOW_WIND.residualGustAmplitude;
    const revealPeak =
      MEADOW_WIND.amplitude * (1 + MEADOW_WIND.bootBoost) * peakEnvelope;
    expect(limitMeadowWind(revealPeak)).toBeLessThan(MEADOW_WIND.gustCeiling);
  });

  it("exposes the same normalized amplitude to the ambient audio bed", () => {
    const baseline = meadowWindAudioLevel(MEADOW_WIND.amplitude);
    const reveal = meadowWindAudioLevel(
      MEADOW_WIND.amplitude * (1 + MEADOW_WIND.bootBoost),
    );
    expect(baseline).toBeCloseTo(0.7, 4);
    expect(reveal).toBeGreaterThan(baseline);
    expect(meadowWindAudioLevel(MEADOW_WIND.audioReference)).toBe(1);
    expect(meadowWindAudioLevel(MEADOW_WIND.gustCeiling)).toBe(1);
  });

  it("gives diagnostics a visibly exaggerated tuning extreme", () => {
    const authored = sampleMeadowGust(10);
    const extreme = sampleMeadowGust(10, MEADOW_WIND.amplitude * 10);
    expect(extreme).toBeGreaterThan(authored * 5);
    expect(extreme).toBeGreaterThan(0.6);
    expect(extreme).toBeLessThan(MEADOW_WIND.maxLean);
  });

  it("builds the live gust from two smooth sine waves", () => {
    const mainPeriod =
      (Math.PI * 2) / (MEADOW_WIND.speed * MEADOW_WIND.mainGustRate);
    const residualPeriod =
      (Math.PI * 2) / (MEADOW_WIND.speed * MEADOW_WIND.residualGustRate);
    expect(mainPeriod).toBeGreaterThan(9);
    expect(residualPeriod).toBeGreaterThan(22);

    const now = sampleMeadowGust(3);
    const later = sampleMeadowGust(8);
    const paused = sampleMeadowGust(8, MEADOW_WIND.amplitude, 0);
    const pausedLater = sampleMeadowGust(80, MEADOW_WIND.amplitude, 0);
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThanOrEqual(MEADOW_WIND.gustCeiling);
    expect(later).not.toBe(now);
    expect(pausedLater).toBe(paused);

    for (const start of [0, 3_600]) {
      let previous = sampleMeadowGust(start);
      for (let time = start + 0.1; time <= start + 120; time += 0.1) {
        const next = sampleMeadowGust(time);
        expect(Math.abs(next - previous)).toBeLessThan(0.009);
        previous = next;
      }
    }
  });

  it("doubles one positive main gust about once every five cycles", () => {
    const mainPeakAt = (cycle: number) =>
      (Math.PI / 2 + Math.PI * 2 * cycle - MEADOW_WIND.mainGustPhase) /
      (MEADOW_WIND.speed * MEADOW_WIND.mainGustRate);
    const rareTime = mainPeakAt(MEADOW_WIND.rareGustOffset);
    const rare = sampleMeadowGust(rareTime);
    const residual = Math.sin(
      rareTime * MEADOW_WIND.speed * MEADOW_WIND.residualGustRate +
        MEADOW_WIND.residualGustPhase,
    );
    const ordinaryAtSameTime =
      MEADOW_WIND.amplitude *
      (1 +
        MEADOW_WIND.mainGustAmplitude +
        MEADOW_WIND.residualGustAmplitude * residual);
    const expectedRare = limitMeadowWind(
      MEADOW_WIND.amplitude *
        (1 +
          MEADOW_WIND.mainGustAmplitude * 2 +
          MEADOW_WIND.residualGustAmplitude * residual),
    );
    expect(rare - ordinaryAtSameTime).toBeCloseTo(
      expectedRare - ordinaryAtSameTime,
      8,
    );
    expect(
      mainPeakAt(MEADOW_WIND.rareGustOffset + MEADOW_WIND.rareGustEvery) -
        mainPeakAt(MEADOW_WIND.rareGustOffset),
    ).toBeGreaterThan(45);
  });

  it("preserves the original spatial wind envelope around the shared gust", () => {
    for (let time = 0; time <= 40; time += 2) {
      const gust = sampleMeadowGust(time);
      for (const x of [0, 2, 8]) {
        const local = sampleMeadowWind(x, -4, time);
        expect(local.magnitude).toBeGreaterThan(gust * 0.34);
        expect(local.magnitude).toBeLessThan(gust * 1.46);
      }
    }
  });

  it("gives rigid flower heads visible travel with a bounded stem throw", () => {
    const authoredWind = sampleMeadowWind(2, -4, 3).magnitude;
    const authoredThrow =
      authoredWind *
      MEADOW_FLOWER_WIND.response *
      MEADOW_FLOWER_WIND.stemLength;
    const maximumThrow =
      MEADOW_FLOWER_WIND.maxLean * MEADOW_FLOWER_WIND.stemLength;

    expect(authoredThrow).toBeGreaterThan(0.01);
    expect(maximumThrow).toBeGreaterThan(0.05);
    expect(maximumThrow).toBeLessThan(0.1);
  });

  it("does not accelerate the spatial flow as elapsed time grows", () => {
    const frame = 1 / 60;
    const earlyStep = Math.abs(
      sampleMeadowWind(22, 0, 23 + frame).magnitude -
        sampleMeadowWind(22, 0, 23).magnitude,
    );
    const lateStep = Math.abs(
      sampleMeadowWind(22, 0, 3_923.516_666_666_666_4 + frame).magnitude -
        sampleMeadowWind(22, 0, 3_923.516_666_666_666_4).magnitude,
    );

    expect(lateStep).toBeLessThan(0.01);
    expect(lateStep).toBeLessThan(earlyStep * 8 + 0.002);
  });

  it("keeps each interaction below the shader's hard lean clamp at peak wind", () => {
    const peakWind =
      MEADOW_WIND.amplitude *
      (1 +
        MEADOW_WIND.mainGustAmplitude * 2 +
        MEADOW_WIND.residualGustAmplitude) *
      1.45;
    const quietedWind = peakWind * (1 - MEADOW_POKE.windSuppression);
    expect(quietedWind + MEADOW_POKE.hoverStrength).toBeLessThanOrEqual(
      MEADOW_WIND.authoredMaxLean,
    );
    expect(quietedWind + meadowPulseState(0, 1).strength).toBeLessThanOrEqual(
      MEADOW_WIND.authoredMaxLean,
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

  it("keeps physical impacts compact while retaining sharp local force", () => {
    expect(MEADOW_IMPACT.pulseStrengthScale).toBeGreaterThan(1);
    expect(MEADOW_IMPACT.wakeStrengthScale).toBeLessThan(
      MEADOW_IMPACT.pulseStrengthScale,
    );
    expect(MEADOW_IMPACT.directionOffset).toBeGreaterThan(0);
    expect(MEADOW_IMPACT.radiusScale).toBeLessThan(0.5);
    expect(MEADOW_IMPACT.timeScale).toBeGreaterThan(1);
  });

  it("scales physical response by contact energy and collider footprint", () => {
    const golfBall = meadowPhysicalResponse({
      normalSpeed: 8,
      tangentSpeed: 6,
      massKg: 0.046,
      footprint: 0.1,
    });
    const rollingBall = meadowPhysicalResponse({
      normalSpeed: 0,
      tangentSpeed: 1,
      massKg: 0.62,
      footprint: 0.24,
      trailing: true,
    });
    const kettlebell = meadowPhysicalResponse({
      normalSpeed: 1,
      tangentSpeed: 0.4,
      massKg: 16,
      footprint: 0.5,
    });
    expect(golfBall.strength).toBe(1);
    expect(rollingBall.strength).toBeGreaterThan(0);
    expect(rollingBall.strength).toBeLessThan(golfBall.strength);
    expect(kettlebell.radius).toBeGreaterThan(golfBall.radius);
    expect(rollingBall.timeScale).toBe(MEADOW_TRAIL.timeScale);
  });

  it("requires both travel and dwell before emitting another wake", () => {
    expect(
      meadowTrailReady(
        MEADOW_TRAIL.minInterval,
        MEADOW_TRAIL.minDistance,
        MEADOW_TRAIL.minSpeed,
      ),
    ).toBe(true);
    expect(meadowTrailReady(0, 1, 4)).toBe(false);
    expect(meadowTrailReady(1, 0, 4)).toBe(false);
    expect(meadowTrailReady(1, 1, MEADOW_TRAIL.minSpeed - 0.01)).toBe(false);
  });

  it("brushes grass in the mouse travel direction instead of repelling it", () => {
    const forward = meadowDragSample(0, 0, 2, -1, 0.5, 1);
    const reverse = meadowDragSample(2, -1, 0, 0, 0.5, 1);
    expect(forward).toMatchObject({
      directionX: 2 / Math.sqrt(5),
      directionZ: -1 / Math.sqrt(5),
    });
    expect(reverse.directionX).toBeCloseTo(-forward.directionX);
    expect(reverse.directionZ).toBeCloseTo(-forward.directionZ);
    expect(reverse.strength).toBeCloseTo(forward.strength);
    expect(forward.strength).toBeGreaterThan(0);
    expect(meadowDragSample(2, -1, 2, -1, 0.5, 1).strength).toBe(0);
  });
});
