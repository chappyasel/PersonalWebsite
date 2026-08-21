import { describe, expect, it } from "vitest";

import {
  GolfFixedStepper,
  createGolfBallState,
  launchGolfBall,
} from "./golfPhysics";
import {
  GOLF_CONFETTI_COUNT,
  golfMotionPolicy,
  resetGolfSession,
  shouldResetGolfSession,
} from "./golfSession";
import { GolfStrikeQueue } from "./golfStrikeQueue";

describe("golf session presentation and departure", () => {
  it("keeps physics but replaces decorative motion with a static cup cue", () => {
    expect(golfMotionPolicy(true)).toEqual({
      physics: true,
      clubSwing: false,
      glint: false,
      turfPuff: false,
      confetti: false,
      staticCupGlow: true,
    });
    expect(golfMotionPolicy(false).confetti).toBe(true);
    expect(GOLF_CONFETTI_COUNT).toBeGreaterThan(100);
  });

  it("preserves ball state when the visitor scrolls away", () => {
    expect(shouldResetGolfSession("section-departure")).toBe(false);
    expect(shouldResetGolfSession("unmount")).toBe(true);
  });

  it("silently restores every ball and cancels queued strikes on unmount", () => {
    const ball = createGolfBallState("one", { x: -2, y: -1, z: 0 });
    launchGolfBall(ball, { x: 1, y: 2, z: -8 }, "hole-bound");
    const queue = new GolfStrikeQueue();
    queue.tap("two");
    const stepper = new GolfFixedStepper();
    stepper.advance(1 / 60, () => undefined);
    resetGolfSession([ball], queue, stepper);
    expect(ball).toMatchObject({
      phase: "ready",
      position: ball.start,
      outcome: null,
      holed: false,
      opacity: 1,
    });
    expect(queue.snapshot()).toMatchObject({ queued: [], current: null });
    expect(stepper.advance(0, () => undefined)).toBe(0);
  });
});
