import { describe, expect, it } from "vitest";

import { createGolfBallState } from "./golfPhysics";
import {
  GOLF_SUSPENSE,
  type GolfSuspenseState,
  advanceGolfSuspense,
  createGolfSuspenseState,
  golfSuspenseCandidate,
  golfSuspenseFovScale,
  golfSuspenseRequestedBySearch,
  golfSuspenseWeight,
} from "./golfSuspense";
import type { GolfBallState, GolfVec3 } from "./golfTypes";

const cup: GolfVec3 = { x: -1.55, y: -1.0, z: -18.1 };

/** A ball at `distance` short of the cup along the tee line, rolling toward
 * it at `speed` (negative rolls away). */
function rolling(
  id: GolfBallState["id"],
  distance: number,
  speed: number,
  phase: GolfBallState["phase"] = "roll",
): GolfBallState {
  const ball = createGolfBallState(id, {
    x: cup.x,
    y: cup.y,
    z: cup.z + distance,
  });
  ball.phase = phase;
  ball.velocity = { x: 0, y: 0, z: -speed };
  return ball;
}

const run = (
  state: GolfSuspenseState,
  balls: GolfBallState[],
  seconds: number,
  allowed = true,
  hz = 120,
) => {
  let weight = 0;
  for (let i = 0; i < Math.round(seconds * hz); i += 1)
    weight = advanceGolfSuspense(state, balls, cup, 1 / hz, allowed);
  return weight;
};

describe("golf suspense candidate", () => {
  it("is a slow rolling ball at the hole, heading in", () => {
    expect(golfSuspenseCandidate([rolling("one", 1.2, 1)], cup)?.id).toBe(
      "one",
    );
  });

  it.each([
    ["too far away", rolling("one", 3, 1)],
    ["too fast to be in doubt", rolling("one", 1.2, 4)],
    ["already stopped", rolling("one", 1.2, 0)],
    ["rolling away from the cup", rolling("one", 1.2, -1)],
    ["still in the air", rolling("one", 1.2, 1, "flight")],
    ["bouncing", rolling("one", 1.2, 1, "bounce")],
    ["already dropped", rolling("one", 0.05, 0.3, "cup")],
  ])("ignores a ball that is %s", (_reason, ball) => {
    expect(golfSuspenseCandidate([ball], cup)).toBeNull();
  });

  it("keeps a ball on the lip even as it spins away", () => {
    expect(golfSuspenseCandidate([rolling("one", 0.2, -0.6)], cup)?.id).toBe(
      "one",
    );
  });

  it("prefers the ball nearest the cup", () => {
    expect(
      golfSuspenseCandidate(
        [rolling("one", 1.3, 1), rolling("two", 0.6, 1)],
        cup,
      )?.id,
    ).toBe("two");
  });
});

describe("golf suspense push-in", () => {
  it("starts from nothing and costs nothing while nothing is happening", () => {
    const state = createGolfSuspenseState();
    expect(run(state, [rolling("one", 6, 2)], 2)).toBe(0);
    expect(state.progress).toBe(0);
    expect(state.ballId).toBeNull();
  });

  it("pushes in over the attack time at any frame rate", () => {
    for (const hz of [60, 120]) {
      const state = createGolfSuspenseState();
      const ball = rolling("one", 1.2, 0.8);
      expect(
        run(state, [ball], GOLF_SUSPENSE.attackSeconds * 0.5, true, hz),
      ).toBeCloseTo(0.5, 1);
      expect(
        run(state, [ball], GOLF_SUSPENSE.attackSeconds * 0.5 + 0.05, true, hz),
      ).toBe(1);
    }
  });

  it("aims a little short of the cup while the ball still rolls", () => {
    const state = createGolfSuspenseState();
    run(state, [rolling("one", 1.0, 0.8)], 0.5);
    expect(state.aim.z).toBeCloseTo(
      cup.z + 1.0 * GOLF_SUSPENSE.aimTowardBall,
      10,
    );
    expect(state.aim.x).toBeCloseTo(cup.x, 10);
    expect(state.ballId).toBe("one");
  });

  it("holds on the cup through the drop, then lets go slowly", () => {
    const state = createGolfSuspenseState();
    const ball = rolling("one", 0.6, 0.5);
    run(state, [ball], 2);
    expect(state.progress).toBe(1);

    ball.phase = "cup";
    ball.position = { ...cup };
    // Still fully in for the hold, aimed dead on the cup.
    expect(run(state, [ball], GOLF_SUSPENSE.dropHoldSeconds - 0.05)).toBe(1);
    expect(state.aim).toEqual(cup);
    // Then the release takes its own, longer time.
    const halfway = run(state, [ball], 0.05 + GOLF_SUSPENSE.releaseSeconds / 2);
    expect(halfway).toBeCloseTo(0.5, 1);
    expect(run(state, [ball], GOLF_SUSPENSE.releaseSeconds / 2 + 0.05)).toBe(0);
    expect(state.ballId).toBeNull();
  });

  it("holds a shorter beat when the ball dies short of the hole", () => {
    const state = createGolfSuspenseState();
    const ball = rolling("one", 0.6, 0.5);
    run(state, [ball], 2);
    const aimBefore = { ...state.aim };

    ball.velocity = { x: 0, y: 0, z: 0 };
    expect(run(state, [ball], GOLF_SUSPENSE.missHoldSeconds - 0.05)).toBe(1);
    // The aim stays where it was: nothing to look at has moved.
    expect(state.aim).toEqual(aimBefore);
    expect(run(state, [ball], 0.1)).toBeLessThan(1);
  });

  it("releases from wherever it got to when the gate closes or the visitor leaves", () => {
    const state = createGolfSuspenseState();
    const ball = rolling("one", 1.2, 0.8);
    const partial = run(state, [ball], 0.4);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    const next = advanceGolfSuspense(state, [ball], cup, 1 / 120, false);
    expect(next).toBeLessThan(partial);
    expect(next).toBeGreaterThan(partial - 0.05);
    expect(state.holdFor).toBe(0);
    expect(state.ballId).toBeNull();
  });

  it("never integrates a hidden tab's backlog in one frame", () => {
    const state = createGolfSuspenseState();
    expect(
      advanceGolfSuspense(state, [rolling("one", 1.2, 0.8)], cup, 20),
    ).toBeLessThan(0.1);
  });

  it("eases both ends and tightens the lens by the authored fraction", () => {
    expect(golfSuspenseWeight(0)).toBe(0);
    expect(golfSuspenseWeight(0.5)).toBe(0.5);
    expect(golfSuspenseWeight(1)).toBe(1);
    expect(golfSuspenseWeight(0.1)).toBeLessThan(0.1);
    expect(golfSuspenseFovScale(0)).toBe(1);
    expect(golfSuspenseFovScale(1)).toBeCloseTo(1 - GOLF_SUSPENSE.fovPush, 10);
    expect(33 * golfSuspenseFovScale(1)).toBeLessThan(24);
    expect(33 * golfSuspenseFovScale(1)).toBeGreaterThan(20);
  });

  it("is asked for by ?suspense=1 and nothing else", () => {
    expect(golfSuspenseRequestedBySearch("?suspense=1")).toBe(true);
    expect(golfSuspenseRequestedBySearch("?debug=1")).toBe(false);
    expect(golfSuspenseRequestedBySearch("")).toBe(false);
    expect(
      golfSuspenseRequestedBySearch(new URLSearchParams("suspense=1")),
    ).toBe(true);
  });
});
