import { describe, expect, it } from "vitest";

import { TIP } from "./Lift";
import {
  SWAY_DAMPING,
  SWAY_LEAN,
  SWAY_MAX_DELTA,
  SWAY_STIFFNESS,
  SWAY_TWIST,
  cameraSideSwayTwist,
  createSwaySpring,
  stepSway,
} from "./swayMotion";

/** Run a spring at a fixed frame rate until it settles or the budget runs out.
 * Returns the frame count and the largest engagement reached along the way. */
function run(frameRate: number, target: number, maxFrames = 900) {
  const spring = createSwaySpring();
  const delta = 1 / frameRate;
  let frames = 0;
  let peak = 0;
  while (frames < maxFrames) {
    const settled = stepSway(spring, target, delta);
    peak = Math.max(peak, spring.angle);
    frames += 1;
    if (settled) break;
  }
  return { spring, frames, peak, seconds: frames / frameRate };
}

describe("sway spring", () => {
  it("overshoots the target, which is the point of using a spring", () => {
    // An exponential damp approaches and never passes. Leaves pass.
    const { peak } = run(60, 1);
    expect(peak).toBeGreaterThan(1);
    // ...but bounces once rather than flailing. Analytic overshoot for a
    // damping ratio of 20 / (2 * sqrt(300)) = 0.577 is ~11%.
    expect(peak).toBeLessThan(1.2);
  });

  it("carries the lean and the turn as ONE gesture", () => {
    // Both channels scale the same engagement value, so their ratio is fixed
    // at every instant of the motion, including through the overshoot. Two
    // independent springs would drift apart and read as two effects.
    const spring = createSwaySpring();
    const ratios: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      stepSway(spring, 1, 1 / 60);
      const lean = spring.angle * SWAY_LEAN;
      const twist = spring.angle * SWAY_TWIST;
      if (Math.abs(lean) > 1e-6) ratios.push(twist / lean);
    }
    expect(ratios.length).toBeGreaterThan(30);
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(SWAY_TWIST / SWAY_LEAN, 10);
    }
  });

  it("runs at the same speed on 60Hz and 120Hz", () => {
    // The scene has been bitten by this exact bug before: hover easing tuned
    // on a 60Hz panel ran at double rate on a 120Hz one.
    const slow = run(60, 1);
    const fast = run(120, 1);
    const veryFast = run(240, 1);
    expect(fast.seconds).toBeCloseTo(slow.seconds, 1);
    expect(veryFast.seconds).toBeCloseTo(slow.seconds, 1);
    expect(fast.peak).toBeCloseTo(slow.peak, 3);
    expect(veryFast.peak).toBeCloseTo(slow.peak, 3);
  });

  it("settles, and lands exactly on the target when it does", () => {
    // Held Pose: the caller's own settle test can only idle a prop if this
    // one stops moving and reports that it stopped.
    const { spring, frames, seconds } = run(60, 1);
    expect(frames).toBeLessThan(900);
    expect(spring.angle).toBe(1);
    expect(spring.velocity).toBe(0);
    // Slower than the shared nod's ~300ms on purpose, but not a scene apart.
    expect(seconds).toBeGreaterThan(0.3);
    expect(seconds).toBeLessThan(1.2);
  });

  it("returns to rest and settles there when the pointer leaves", () => {
    const spring = createSwaySpring();
    for (let i = 0; i < 300; i += 1) stepSway(spring, 1, 1 / 60);
    let settled = false;
    for (let i = 0; i < 300 && !settled; i += 1)
      settled = stepSway(spring, 0, 1 / 60);
    expect(settled).toBe(true);
    expect(spring.angle).toBe(0);
    expect(spring.velocity).toBe(0);
  });

  it("never crosses behind the authored plane while returning to rest", () => {
    const spring = createSwaySpring();
    for (let frame = 0; frame < 45; frame += 1) stepSway(spring, 1, 1 / 60);

    let minimum = spring.angle;
    for (let frame = 0; frame < 90; frame += 1) {
      stepSway(spring, 0, 1 / 60);
      minimum = Math.min(minimum, spring.angle);
    }

    expect(minimum).toBeGreaterThanOrEqual(0);
  });

  it("does not wind itself up over a long hover", () => {
    // Explicit Euler adds energy to a spring every step. Semi-implicit does
    // not, and a plant hovered for a minute must not be vibrating.
    const spring = createSwaySpring();
    for (let i = 0; i < 3600; i += 1) stepSway(spring, 1, 1 / 60);
    expect(spring.angle).toBe(1);
    expect(spring.velocity).toBe(0);
  });

  it("survives a long frame without flinging the plant", () => {
    // A GC pause or a backgrounded tab hands back a delta of seconds.
    const spring = createSwaySpring();
    stepSway(spring, 1, 5);
    expect(Number.isFinite(spring.angle)).toBe(true);
    expect(Math.abs(spring.angle)).toBeLessThan(2);
    // The cap is what bounds it, so state it.
    expect(SWAY_MAX_DELTA).toBeLessThanOrEqual(1 / 30);
  });

  it("costs nothing once settled at a target it is still asked for", () => {
    // Nine plants x every frame. The idle case has to be a comparison.
    const spring = createSwaySpring();
    let settled = false;
    for (let i = 0; i < 300 && !settled; i += 1)
      settled = stepSway(spring, 1, 1 / 60);
    expect(settled).toBe(true);
    // A zero delta would still integrate if the early-out were missing, and
    // a settled spring must report settled without moving.
    expect(stepSway(spring, 1, 0)).toBe(true);
    expect(spring.angle).toBe(1);
    expect(spring.velocity).toBe(0);
    // ...but a NEW target must wake it up again.
    expect(stepSway(spring, 0, 1 / 60)).toBe(false);
    expect(spring.angle).not.toBe(1);
  });

  it("turns toward the camera's side, whichever side that is", () => {
    // The sign cannot be a constant: the camera sits on different sides of a
    // prop in top-shelf, lower-shelf and portrait compositions.
    expect(cameraSideSwayTwist({ x: 1 }, SWAY_TWIST)).toBe(SWAY_TWIST);
    expect(cameraSideSwayTwist({ x: -1 }, SWAY_TWIST)).toBe(-SWAY_TWIST);
    expect(cameraSideSwayTwist({ x: 1 }, 0)).toBe(0);
  });

  it("leans forward less than the nod but turns only slightly", () => {
    // The lean shares TIP's axis and pivot, so the two are directly
    // comparable: a plant is taller, so a smaller angle moves its crown
    // further.
    expect(SWAY_LEAN).toBeLessThan(TIP);
    // The turn is meant to be felt, not read. Anything approaching the lean
    // stops being a plant orienting on you and becomes a prop spinning.
    expect(SWAY_TWIST).toBeLessThan(SWAY_LEAN / 2);
  });

  it("leans further than the ambient draught it composes with", () => {
    // Sway in eggs.tsx peaks at 0.026 and is meant to be missed. A hover
    // answer that lands inside the room's own idle motion is not an answer.
    expect(SWAY_LEAN).toBeGreaterThan(0.026 * 2);
  });

  it("is underdamped by construction", () => {
    // Guards the constants against a retune that quietly removes the bounce.
    const ratio = SWAY_DAMPING / (2 * Math.sqrt(SWAY_STIFFNESS));
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(0.4);
  });
});
