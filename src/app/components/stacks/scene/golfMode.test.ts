import { describe, expect, it } from "vitest";

import {
  GOLF_MODE_DEFAULT,
  advanceGolfMode,
  createGolfModeState,
  golfModeWeight,
} from "./golfMode";

describe("golf mode weight", () => {
  it("is off below the blend start, full at the on threshold, eased between", () => {
    expect(golfModeWeight(0)).toBe(0);
    expect(golfModeWeight(GOLF_MODE_DEFAULT.blendFrom)).toBe(0);
    expect(golfModeWeight(GOLF_MODE_DEFAULT.enterAbove)).toBe(1);
    expect(golfModeWeight(1)).toBe(1);
    const mid = (GOLF_MODE_DEFAULT.blendFrom + GOLF_MODE_DEFAULT.enterAbove) / 2;
    expect(golfModeWeight(mid)).toBeCloseTo(0.5, 12);
    let previous = 0;
    for (let coverage = 0; coverage <= 1; coverage += 0.01) {
      const weight = golfModeWeight(coverage);
      expect(weight).toBeGreaterThanOrEqual(previous);
      previous = weight;
    }
  });

  it("treats an empty band as a step", () => {
    expect(golfModeWeight(0.5, { blendFrom: 0.6, enterAbove: 0.6 })).toBe(0);
    expect(golfModeWeight(0.6, { blendFrom: 0.6, enterAbove: 0.6 })).toBe(1);
  });
});

describe("golf mode switch", () => {
  const frame = 1 / 60;
  const settle = (state: ReturnType<typeof createGolfModeState>) => {
    state.heldFor = Infinity;
    return state;
  };

  it("flips on at the on threshold and off below the off threshold, not between", () => {
    const state = createGolfModeState();
    expect(advanceGolfMode(state, GOLF_MODE_DEFAULT.enterAbove - 0.01, frame)).toBe(false);
    expect(advanceGolfMode(state, GOLF_MODE_DEFAULT.enterAbove, frame)).toBe(true);
    settle(state);
    // Down through the band the switch holds.
    expect(advanceGolfMode(state, GOLF_MODE_DEFAULT.leaveBelow, frame)).toBe(true);
    expect(advanceGolfMode(state, GOLF_MODE_DEFAULT.leaveBelow - 0.01, frame)).toBe(false);
    settle(state);
    // Back up through the band it stays off until the on threshold.
    expect(advanceGolfMode(state, GOLF_MODE_DEFAULT.enterAbove - 0.01, frame)).toBe(false);
    expect(advanceGolfMode(state, 1, frame)).toBe(true);
  });

  it("holds for the authored time after a flip", () => {
    const state = createGolfModeState();
    expect(advanceGolfMode(state, 1, frame)).toBe(true);
    // A cursor that crosses straight back cannot flip it within the hold.
    let elapsed = 0;
    while (elapsed + frame < GOLF_MODE_DEFAULT.holdSeconds) {
      expect(advanceGolfMode(state, 0, frame)).toBe(true);
      elapsed += frame;
    }
    expect(advanceGolfMode(state, 0, frame * 2)).toBe(false);
  });

  it("starts where a jump put it, with no hold to wait out", () => {
    const state = createGolfModeState(true);
    expect(advanceGolfMode(state, 0, frame)).toBe(false);
    const fresh = createGolfModeState();
    expect(advanceGolfMode(fresh, 1, frame)).toBe(true);
  });

  it("never lets the off threshold sit above the on threshold", () => {
    const state = createGolfModeState(true);
    const tuning = { enterAbove: 0.8, leaveBelow: 0.95, holdSeconds: 0 };
    expect(advanceGolfMode(state, 0.85, frame, tuning)).toBe(true);
    expect(advanceGolfMode(state, 0.79, frame, tuning)).toBe(false);
  });

  it("ignores a negative frame", () => {
    const state = createGolfModeState();
    advanceGolfMode(state, 1, frame);
    const held = state.heldFor;
    advanceGolfMode(state, 1, -5);
    expect(state.heldFor).toBe(held);
  });
});
