import { describe, expect, it } from "vitest";

import {
  BAT_FLIGHT,
  MOTH_FLIGHT,
  batFlightFrame,
  createMothFrame,
  mothFrame,
} from "./wildlifeBehavior";

describe("night wildlife behavior", () => {
  it("keeps the bat rare, gated to night, and smoothly enveloped", () => {
    const out = {
      opacity: 0,
      progress: 0,
      flap: 0,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
    };
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
