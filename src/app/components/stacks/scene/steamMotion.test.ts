import { describe, expect, it } from "vitest";

import {
  STEAM_MOTION,
  type SteamSample,
  writeSteamSample,
} from "./steamMotion";

function sample(
  overrides: Partial<Parameters<typeof writeSteamSample>[1]> = {},
) {
  const target: SteamSample = {
    x: 0,
    y: 0,
    z: 0,
    width: 0,
    height: 0,
    opacity: 0,
    flowX: 0,
    flowY: 0,
    flowZ: 0,
  };
  return writeSteamSample(target, {
    originX: 2,
    originY: 1,
    originZ: -3,
    progress: 0.5,
    age: STEAM_MOTION.life * 0.5,
    time: 4,
    phase: 0,
    windX: 0,
    windZ: 0,
    inheritedX: 0,
    inheritedY: 0,
    inheritedZ: 0,
    size: 0.05,
    ...overrides,
  });
}

describe("tea steam motion", () => {
  it("rises and broadens as it cools", () => {
    const young = sample({ progress: 0.1, age: STEAM_MOTION.life * 0.1 });
    const old = sample({ progress: 0.8, age: STEAM_MOTION.life * 0.8 });

    expect(old.y).toBeGreaterThan(young.y);
    expect(old.width).toBeGreaterThan(young.width);
    expect(old.height).toBeGreaterThan(old.width);
  });

  it("advects in the same world-space direction as the meadow wind", () => {
    const still = sample();
    const windy = sample({ windX: 0.16, windZ: -0.08 });

    expect(windy.x).toBeGreaterThan(still.x);
    expect(windy.z).toBeLessThan(still.z);
  });

  it("accumulates more wind displacement over a particle's lifetime", () => {
    const youngStill = sample({ progress: 0.2, age: 0.44 });
    const youngWindy = sample({
      progress: 0.2,
      age: 0.44,
      windX: 0.14,
    });
    const oldStill = sample({ progress: 0.8, age: 1.76 });
    const oldWindy = sample({
      progress: 0.8,
      age: 1.76,
      windX: 0.14,
    });

    expect(oldWindy.x - oldStill.x).toBeGreaterThan(
      youngWindy.x - youngStill.x,
    );
  });

  it("briefly inherits a moving cup's velocity and then yields to drag", () => {
    const youngStill = sample({ progress: 0.08, age: 0.176 });
    const youngCarried = sample({
      progress: 0.08,
      age: 0.176,
      inheritedX: 0.24,
    });
    const oldCarried = sample({
      progress: 0.8,
      age: 1.76,
      inheritedX: 0.24,
    });

    expect(youngCarried.x).toBeGreaterThan(youngStill.x);
    expect(oldCarried.flowX).toBeLessThan(youngCarried.flowX);
  });

  it("fades in at the mouth and fully dissipates at the end", () => {
    expect(sample({ progress: 0 }).opacity).toBe(0);
    expect(sample({ progress: 0.25 }).opacity).toBeGreaterThan(0.7);
    expect(sample({ progress: 1 }).opacity).toBe(0);
  });
});
