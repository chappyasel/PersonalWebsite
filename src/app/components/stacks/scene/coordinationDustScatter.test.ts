import { describe, expect, it } from "vitest";

import {
  scatterCoordinationDust,
  stepDustScatter,
} from "./coordinationDustScatter";

const viewport = { width: 1600, height: 900 };
const orb = { x: 1200, y: 300 };

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** A small ball of grains around the orb. */
const cloud = (count = 150) =>
  Array.from({ length: count }, (_, index) => {
    const angle = index * 2.4;
    const reach = 4 + (index % 30);
    return {
      x: orb.x + Math.cos(angle) * reach,
      y: orb.y + Math.sin(angle) * reach,
    };
  });

const run = (seconds: number, grains = cloud()) => {
  const scatter = scatterCoordinationDust(grains, orb, viewport, seeded());
  for (let left = seconds; left > 0; left -= 1 / 60) {
    stepDustScatter(scatter, 1 / 60);
  }
  return scatter;
};

const spots = (scatter: ReturnType<typeof run>) =>
  Array.from({ length: scatter.count }, (_, index) => ({
    x: scatter.position[index * 2]!,
    y: scatter.position[index * 2 + 1]!,
  }));

describe("scatterCoordinationDust", () => {
  it("starts every grain exactly where it sat in the orb", () => {
    const grains = cloud();
    expect(spots(run(0, grains))[17]).toEqual({
      x: Math.fround(grains[17]!.x),
      y: Math.fround(grains[17]!.y),
    });
  });

  it("blows out of the orb at once", () => {
    const after = spots(run(0.4));
    const left = after.filter(
      (spot) => Math.hypot(spot.x - orb.x, spot.y - orb.y) > 150,
    );
    expect(left.length).toBeGreaterThan(after.length * 0.9);
  });

  it("reaches every part of the window", () => {
    const after = spots(run(4));
    const quarters = new Set(
      after.map(
        (spot) =>
          `${spot.x < viewport.width / 2 ? "left" : "right"}-${spot.y < viewport.height / 2 ? "top" : "bottom"}`,
      ),
    );
    expect(quarters.size).toBe(4);
    const inside = after.filter(
      (spot) =>
        spot.x > 0 &&
        spot.x < viewport.width &&
        spot.y > 0 &&
        spot.y < viewport.height,
    );
    expect(inside.length).toBeGreaterThan(after.length * 0.9);
  });

  it("keeps drifting after it has spread out", () => {
    const early = spots(run(5));
    const late = spots(run(6));
    expect(
      Math.hypot(early[9]!.x - late[9]!.x, early[9]!.y - late[9]!.y),
    ).toBeGreaterThan(1);
  });

  it("does not take a grain at the orb's centre out on NaN", () => {
    const after = spots(run(1, [{ ...orb }]));
    expect(Number.isFinite(after[0]!.x)).toBe(true);
  });
});
