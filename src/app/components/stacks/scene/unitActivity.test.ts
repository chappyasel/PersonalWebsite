import { describe, expect, it } from "vitest";

import {
  directionalUnitLookahead,
  projectedUnitIntersects,
  resolveUnitActivityState,
} from "./unitActivity";

describe("resident unit activity", () => {
  it("treats a unit spanning the viewport as visible even when both edges are outside", () => {
    expect(
      projectedUnitIntersects({ inDepth: true, minX: -1.4, maxX: 1.4 }, 1.05),
    ).toBe(true);
  });

  it("rejects units outside the horizontal envelope or camera depth", () => {
    expect(
      projectedUnitIntersects({ inDepth: true, minX: 1.21, maxX: 1.8 }, 1.2),
    ).toBe(false);
    expect(
      projectedUnitIntersects({ inDepth: false, minX: -0.2, maxX: 0.2 }, 1.05),
    ).toBe(false);
  });

  it("uses hysteresis and a 250ms cold delay without unmounting state", () => {
    const projected = { inDepth: true, minX: 1.1, maxX: 1.8 };
    expect(
      resolveUnitActivityState({
        projected,
        previous: "hot",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: -1,
        now: 100,
      }).state,
    ).toBe("hot");
    const leaving = resolveUnitActivityState({
      projected: { inDepth: true, minX: 1.7, maxX: 2.1 },
      previous: "warm",
      active: false,
      lookahead: false,
      pinned: false,
      enabled: true,
      outsideSince: -1,
      now: 100,
    });
    expect(leaving).toEqual({ state: "warm", outsideSince: 100 });
    expect(
      resolveUnitActivityState({
        projected: { inDepth: true, minX: 1.7, maxX: 2.1 },
        previous: "warm",
        active: false,
        lookahead: false,
        pinned: false,
        enabled: true,
        outsideSince: leaving.outsideSince,
        now: 351,
      }).state,
    ).toBe("cold");
  });

  it("keeps active, lookahead, and pinned units prepared", () => {
    const offscreen = { inDepth: true, minX: 2, maxX: 3 };
    const base = {
      projected: offscreen,
      previous: "cold" as const,
      active: false,
      lookahead: false,
      pinned: false,
      enabled: true,
      outsideSince: 0,
      now: 1_000,
    };
    expect(resolveUnitActivityState({ ...base, active: true }).state).toBe(
      "warm",
    );
    expect(resolveUnitActivityState({ ...base, lookahead: true }).state).toBe(
      "warm",
    );
    expect(resolveUnitActivityState({ ...base, pinned: true }).state).toBe(
      "hot",
    );
    expect(directionalUnitLookahead(2.4, 1, 7)).toBe(3);
    expect(directionalUnitLookahead(2.4, -1, 7)).toBe(1);
    expect(directionalUnitLookahead(6, 1, 7)).toBe(6);
  });
});
