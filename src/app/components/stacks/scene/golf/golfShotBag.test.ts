import { describe, expect, it } from "vitest";

import {
  GolfShotBag,
  golfBagComposition,
  seededGolfRandom,
  shuffledGolfBag,
} from "./golfShotBag";

describe("golf shot bags", () => {
  it("uses the production and development compositions", () => {
    const production = golfBagComposition("production");
    expect(production).toHaveLength(20);
    expect(production.filter((v) => v === "hole-bound")).toHaveLength(1);
    expect(production.filter((v) => v === "near-miss")).toHaveLength(3);
    expect(production.filter((v) => v === "ordinary-green")).toHaveLength(15);
    expect(production.filter((v) => v === "rare-miss")).toHaveLength(1);
    expect(golfBagComposition("development")).toEqual(
      expect.arrayContaining(["hole-bound", "near-miss", "ordinary-green"]),
    );
  });

  it("is deterministic and prevents winners across cycle boundaries", () => {
    const a = seededGolfRandom(17);
    const b = seededGolfRandom(17);
    expect(shuffledGolfBag("production", a)).toEqual(
      shuffledGolfBag("production", b),
    );
    for (let seed = 0; seed < 200; seed += 1) {
      const bag = new GolfShotBag("production", seededGolfRandom(seed));
      const shots = Array.from({ length: 100 }, () => bag.next());
      for (let i = 1; i < shots.length; i += 1) {
        expect([shots[i - 1], shots[i]]).not.toEqual([
          "hole-bound",
          "hole-bound",
        ]);
      }
    }
  });

  it("retries a disrupted winner after two non-winning shots and supports injection", () => {
    const bag = new GolfShotBag("development", seededGolfRandom(4));
    bag.retryWinner();
    expect(bag.next()).not.toBe("hole-bound");
    expect(bag.next()).not.toBe("hole-bound");
    expect(bag.next()).toBe("hole-bound");
    bag.force("rare-miss");
    expect(bag.next()).toBe("rare-miss");
  });

  it("lets a natural hole satisfy the current cycle", () => {
    const bag = new GolfShotBag("development", seededGolfRandom(8));
    bag.next();
    bag.recordNaturalHole();
    const restOfCycle = [bag.next(), bag.next()];
    expect(restOfCycle).not.toContain("hole-bound");
  });
});
