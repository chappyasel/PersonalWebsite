import { describe, expect, it } from "vitest";

import {
  BAT_FLIGHT,
  MOTH_FLIGHT,
  batFlightFrame,
  createBatFrame,
  createMothFrame,
  mothFrame,
} from "./wildlifeBehavior";

describe("night wildlife behavior", () => {
  it("keeps the bat rare, gated to night, and smoothly enveloped", () => {
    const out = createBatFrame();
    expect(
      batFlightFrame(BAT_FLIGHT.firstRevealSeconds - 0.1, 1, out).opacity,
    ).toBe(0);
    expect(
      batFlightFrame(BAT_FLIGHT.firstRevealSeconds + 2, 0, out).opacity,
    ).toBe(0);
    expect(
      batFlightFrame(BAT_FLIGHT.firstRevealSeconds + 2, 1, out).opacity,
    ).toBeGreaterThan(0);
    expect(BAT_FLIGHT.visibleFraction).toBeLessThanOrEqual(0.2);
  });

  it("varies the bat's pace without reversing its crossing", () => {
    const out = createBatFrame();
    const start = BAT_FLIGHT.firstRevealSeconds;
    const duration = BAT_FLIGHT.periodSeconds * BAT_FLIGHT.visibleFraction;
    let previous = -Infinity;
    let slowestStep = Infinity;
    let fastestStep = -Infinity;
    for (let sample = 0; sample < 240; sample++) {
      const frame = batFlightFrame(start + duration * (sample / 240), 1, out);
      if (sample > 0) {
        const step = frame.travelProgress - previous;
        slowestStep = Math.min(slowestStep, step);
        fastestStep = Math.max(fastestStep, step);
        expect(step).toBeGreaterThan(0);
      }
      previous = frame.travelProgress;
    }
    expect(fastestStep).toBeGreaterThan(slowestStep * 1.25);
  });

  it("ties moth visibility to the live lamp amount", () => {
    const out = createMothFrame();
    expect(
      mothFrame(
        0,
        12,
        0,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        out,
      ).opacity,
    ).toBe(0);
    expect(
      mothFrame(
        0,
        12,
        0.5,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        out,
      ).opacity,
    ).toBe(0.5);
    expect(
      mothFrame(
        0,
        12,
        1,
        MOTH_FLIGHT.nearDistance,
        MOTH_FLIGHT.farDistance,
        MOTH_FLIGHT.maxRadius,
        out,
      ).opacity,
    ).toBe(1);
  });
});
