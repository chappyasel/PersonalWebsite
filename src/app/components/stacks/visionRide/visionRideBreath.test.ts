import { describe, expect, it } from "vitest";

import {
  VISION_RIDE_BREATH,
  VISION_RIDE_BREATH_PERIOD_SECONDS,
  breathPhase,
  chaseOffsetForScale,
  environmentBreath,
} from "./visionRideBreath";
import { VISION_RIDE_INTRO_SECONDS, chaseFraming } from "./visionRideCamera";

const half = VISION_RIDE_BREATH.halfCycleSeconds;
const landscape = chaseFraming(false).chaseDistance;
const portrait = chaseFraming(true).chaseDistance;

describe("Vision ride environmental breathing", () => {
  it("takes 30 s from smallest to largest and 30 s back", () => {
    expect(half).toBe(30);
    expect(VISION_RIDE_BREATH_PERIOD_SECONDS).toBe(60);
    expect(breathPhase(0)).toBeCloseTo(0, 9);
    expect(breathPhase(half)).toBeCloseTo(1, 9);
    expect(breathPhase(half * 2)).toBeCloseTo(0, 9);
    expect(breathPhase(half * 3)).toBeCloseTo(1, 9);
  });

  it("rises monotonically for the first half and falls for the second", () => {
    let previous = breathPhase(0);
    for (let t = 0.5; t <= half; t += 0.5) {
      const next = breathPhase(t);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
    for (let t = half + 0.5; t <= half * 2; t += 0.5) {
      const next = breathPhase(t);
      expect(next).toBeLessThan(previous);
      previous = next;
    }
  });

  it("is symmetric about the crest and smooth at both turning points", () => {
    for (const fraction of [0.05, 0.29, 0.68, 0.98]) {
      const t = half * fraction;
      expect(breathPhase(half - t)).toBeCloseTo(breathPhase(half + t), 9);
    }
    // Raised cosine: the slope vanishes at the ends, so the direction change
    // is never felt. A 0.5 s step near either end moves under 0.001.
    expect(breathPhase(0.5) - breathPhase(0)).toBeLessThan(0.001);
    expect(breathPhase(half) - breathPhase(half - 0.5)).toBeLessThan(0.001);
  });

  it("starts at the authored base and stays still through the acceleration", () => {
    const start = environmentBreath(0, false, landscape);
    expect(start.phase).toBe(0);
    expect(start.sunScale).toBe(1);
    expect(start.carScale).toBe(1);
    expect(start.chaseOffset).toBe(0);
    // The 2.8 s acceleration into the chase is the authored part of the
    // arrival that must not swell; the cosine is still nearly flat there.
    expect(environmentBreath(2.8, false, landscape).phase).toBeLessThan(0.025);
    // By the end of the opening shot the swell has barely begun, so the opening
    // shot lands on the authored base frame.
    const arrival = environmentBreath(
      VISION_RIDE_INTRO_SECONDS,
      false,
      landscape,
    );
    expect(arrival.phase).toBeGreaterThan(0);
    expect(arrival.phase).toBeLessThan(0.1);
  });

  it("closes exactly the distance that delivers an apparent scale", () => {
    expect(chaseOffsetForScale(1, 7)).toBe(0);
    // Half again as large means two thirds of the distance: a third closed.
    expect(chaseOffsetForScale(1.5, 9)).toBeCloseTo(-3, 9);
    // The relation is exact, not a linear approximation: the remaining
    // distance times the scale is the original distance.
    for (const scale of [1.1, 1.25, 1.5, 2]) {
      for (const distance of [landscape, portrait, 3]) {
        const remaining = distance + chaseOffsetForScale(scale, distance);
        expect(remaining * scale).toBeCloseTo(distance, 9);
        expect(remaining).toBeGreaterThan(0);
      }
    }
  });

  it("grows the car's rear 2.25x, the same fraction on either orientation", () => {
    // The owner's call: matched to the sun's 1.5x the car still read as
    // timid, so the crest car fills half again as much of the frame as that.
    expect(1 + VISION_RIDE_BREATH.carGrowth).toBeCloseTo(
      (1 + VISION_RIDE_BREATH.sunGrowth) * 1.5,
      9,
    );
    for (const distance of [landscape, portrait]) {
      const crest = environmentBreath(half, false, distance);
      expect(crest.phase).toBeCloseTo(1, 9);
      expect(crest.sunScale).toBeCloseTo(1 + VISION_RIDE_BREATH.sunGrowth, 9);
      // Half again the disc at the crest: readable, short of a second sun.
      expect(crest.sunScale).toBeGreaterThanOrEqual(1.45);
      expect(crest.sunScale).toBeLessThan(1.7);
      expect(crest.carScale).toBeCloseTo(1 + VISION_RIDE_BREATH.carGrowth, 9);
      // The chase closes whatever fraction of this orientation's distance
      // makes the car read that much larger; a fixed 1.1 m did not.
      expect(crest.chaseOffset).toBeCloseTo(
        chaseOffsetForScale(crest.carScale, distance),
        9,
      );
      // Closes more than the fixed 1.1 m ever did, on either orientation.
      expect(crest.chaseOffset).toBeLessThan(-1.1);
      // Every derived value is a function of the one phase.
      const mid = environmentBreath(half / 2, false, distance);
      expect(mid.sunScale - 1).toBeCloseTo(
        VISION_RIDE_BREATH.sunGrowth * mid.phase,
        9,
      );
      expect(mid.carScale - 1).toBeCloseTo(
        VISION_RIDE_BREATH.carGrowth * mid.phase,
        9,
      );
      expect((distance + mid.chaseOffset) * mid.carScale).toBeCloseTo(
        distance,
        9,
      );
    }
    // Same fraction, different metres: portrait chases from further back.
    const crestLandscape = environmentBreath(half, false, landscape);
    const crestPortrait = environmentBreath(half, false, portrait);
    expect(crestPortrait.chaseOffset / portrait).toBeCloseTo(
      crestLandscape.chaseOffset / landscape,
      9,
    );
    expect(crestPortrait.chaseOffset).toBeLessThan(crestLandscape.chaseOffset);
  });

  it("holds the base frame under reduced motion", () => {
    for (const t of [0, 30, 60, 95]) {
      expect(environmentBreath(t, true, landscape)).toEqual({
        phase: 0,
        sunScale: 1,
        carScale: 1,
        chaseOffset: 0,
      });
    }
  });
});
