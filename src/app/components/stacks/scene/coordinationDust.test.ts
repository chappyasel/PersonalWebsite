import { describe, expect, it } from "vitest";

import {
  type CoordinationDust,
  blowCoordinationDust,
  createCoordinationDust,
  kickCoordinationDust,
  moveCoordinationDustHand,
  stepCoordinationDust,
} from "./coordinationDust";

const rest = { spin: 0.07, gather: 1 };

/** A fixed sequence, so a failure here is never a bad roll. */
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const dust = () => createCoordinationDust(120, seeded());

function settle(field: CoordinationDust, seconds = 6, input = rest) {
  for (let time = 0; time < seconds; time += 1 / 60) {
    stepCoordinationDust(field, 1 / 60, input);
  }
}

function spread(field: CoordinationDust) {
  let total = 0;
  for (let index = 0; index < field.count; index += 1) {
    total += Math.hypot(
      field.position[index * 3]!,
      field.position[index * 3 + 1]!,
      field.position[index * 3 + 2]!,
    );
  }
  return total / field.count;
}

function meanSpeed(field: CoordinationDust) {
  let total = 0;
  for (let index = 0; index < field.count; index += 1) {
    total += Math.hypot(
      field.velocity[index * 3]!,
      field.velocity[index * 3 + 1]!,
      field.velocity[index * 3 + 2]!,
    );
  }
  return total / field.count;
}

function meanX(field: CoordinationDust) {
  let total = 0;
  for (let index = 0; index < field.count; index += 1) {
    total += field.position[index * 3]!;
  }
  return total / field.count;
}

describe("coordination dust", () => {
  it("stays a finite cloud around the blinker over a long run", () => {
    const field = dust();
    settle(field, 60);
    expect(field.position.every(Number.isFinite)).toBe(true);
    expect(spread(field)).toBeGreaterThan(40);
    expect(spread(field)).toBeLessThan(220);
  });

  it("rises to its resting brightness", () => {
    const field = dust();
    expect(field.alpha[0]).toBe(0);
    settle(field, 12);
    expect(field.alpha[0]).toBeCloseTo(field.peak[0]!, 2);
  });

  it("is only stirred by a pointer that is moving", () => {
    const still = dust();
    moveCoordinationDustHand(still, 0, 0, 0);
    settle(still, 1);

    const stirred = dust();
    moveCoordinationDustHand(stirred, 0, 0, 0);
    moveCoordinationDustHand(stirred, 150, 0, 0);
    stepCoordinationDust(stirred, 1 / 60, rest);
    settle(stirred, 0.2);

    expect(meanX(stirred)).toBeGreaterThan(meanX(still) + 1);
  });

  it("lets a pointer's stir die away", () => {
    const field = dust();
    moveCoordinationDustHand(field, 0, 0, 0);
    moveCoordinationDustHand(field, 150, 0, 0);
    settle(field, 2);
    expect(Math.hypot(field.hand!.vx, field.hand!.vy, field.hand!.vz)).toBeLessThan(
      0.01,
    );
  });

  it("is carried by the wind, then drifts home", () => {
    const field = dust();
    settle(field, 6);
    const before = meanX(field);
    blowCoordinationDust(field, 120, 0, 0);
    settle(field, 0.4);
    expect(meanX(field)).toBeGreaterThan(before + 20);
    settle(field, 8);
    expect(Math.abs(meanX(field) - before)).toBeLessThan(12);
  });

  it("caps one gust, so a teleporting camera cannot fling the cloud", () => {
    const field = dust();
    blowCoordinationDust(field, 90_000, 0, 0);
    expect(field.gust.x).toBeLessThanOrEqual(110);
  });

  it("gathers toward the blinker as it charges", () => {
    const field = dust();
    settle(field, 6);
    const resting = spread(field);
    settle(field, 6, { spin: 0.5, gather: 0.5 });
    expect(spread(field)).toBeLessThan(resting * 0.7);
  });

  it("scatters when kicked", () => {
    const field = dust();
    settle(field, 6);
    const before = meanSpeed(field);
    kickCoordinationDust(field, 420, seeded(7));
    expect(meanSpeed(field)).toBeGreaterThan(before + 50);
  });

  it("moves the same on a slow device", () => {
    const fast = dust();
    const slow = dust();
    for (let frame = 0; frame < 12; frame += 1) {
      stepCoordinationDust(fast, 1 / 60, rest);
    }
    stepCoordinationDust(slow, 12 / 60, rest);
    for (let index = 0; index < 30; index += 1) {
      expect(slow.position[index]).toBeCloseTo(fast.position[index]!, 1);
    }
  });
});
