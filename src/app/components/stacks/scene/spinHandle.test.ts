import { describe, expect, it } from "vitest";

import { SPIN_MAX_HAND_SPEED, createSpinHandle } from "./spinHandle";

const DT = 1 / 60;

describe("globe momentum", () => {
  it("takes over a hovering globe without jumping to a hidden angle", () => {
    const hand = createSpinHandle();
    for (let i = 0; i < 120; i++) hand.step(DT, 0.99);
    const speed = hand.state.velocity;
    hand.setCalm(true);
    hand.setHeld(true);
    expect(hand.state.velocity).toBe(speed);
    const turn = hand.step(DT, 0);
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThan(speed * DT);
    expect(turn).toBeLessThan(0.02);
  });

  it("accelerates under a drag and preserves speed on release", () => {
    const hand = createSpinHandle();
    hand.setCalm(true);
    hand.setHeld(true);
    hand.turn(0.04);
    const first = hand.step(DT, 0);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.004);
    for (let i = 0; i < 20; i++) {
      hand.turn(0.04);
      hand.step(DT, 0);
    }
    const speed = hand.state.velocity;
    hand.setHeld(false);
    expect(hand.state.velocity).toBe(speed);
    expect(hand.step(DT, 0)).toBeGreaterThan(first);
    expect(hand.state.velocity).toBeLessThan(speed);
  });

  it("slows during a stationary hold without needing another pointer event", () => {
    const hand = createSpinHandle();
    hand.setCalm(true);
    hand.setHeld(true);
    hand.turn(1);
    hand.step(DT, 0);
    for (let i = 0; i < 180; i++) hand.step(DT, 0);
    hand.setHeld(false);
    expect(hand.step(DT, 0)).toBeLessThan(0.000001);
  });

  it("bounds fast drags and changes direction gradually", () => {
    const hand = createSpinHandle();
    hand.setCalm(true);
    hand.setHeld(true);
    for (let i = 0; i < 120; i++) {
      hand.turn(100);
      hand.step(DT, 0);
      expect(hand.state.velocity).toBeLessThanOrEqual(SPIN_MAX_HAND_SPEED);
    }
    hand.turn(-0.04);
    expect(hand.step(DT, 0)).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) {
      hand.turn(-0.04);
      hand.step(DT, 0);
    }
    expect(hand.state.velocity).toBeLessThan(0);
    expect(hand.state.velocity).toBeGreaterThanOrEqual(-SPIN_MAX_HAND_SPEED);
  });

  it("travels the same distance at 30, 60 and 120 frames per second", () => {
    const simulate = (hz: number) => {
      const hand = createSpinHandle();
      hand.setCalm(true);
      hand.setHeld(true);
      let angle = 0;
      for (let i = 0; i < hz; i++) {
        hand.turn(1 / hz);
        angle += hand.step(1 / hz, 0);
      }
      hand.setHeld(false);
      for (let i = 0; i < hz * 2; i++) angle += hand.step(1 / hz, 0);
      return angle;
    };
    expect(simulate(30)).toBeCloseTo(simulate(120), 10);
    expect(simulate(60)).toBeCloseTo(simulate(120), 10);
  });

  it("keeps the same drag weight when pointer samples arrive less often than frames", () => {
    const simulate = (sampleEvery: number) => {
      const hand = createSpinHandle();
      hand.setCalm(true);
      hand.setHeld(true);
      let angle = 0;
      for (let frame = 0; frame < 120; frame++) {
        if (frame % sampleEvery === 0) hand.turn((2 * sampleEvery) / 120);
        angle += hand.step(1 / 120, 0);
      }
      hand.setHeld(false);
      for (let frame = 0; frame < 240; frame++) angle += hand.step(1 / 120, 0);
      return angle;
    };
    expect(simulate(2)).toBeCloseTo(simulate(1), 1);
    expect(simulate(4)).toBeCloseTo(simulate(1), 1);
  });

  it("counts actual hand-driven rotation, including coast, but excludes idle", () => {
    let counted = 0;
    const hand = createSpinHandle((turn) => {
      counted += turn;
    });
    hand.step(DT, 0.99);
    expect(counted).toBe(0);
    hand.setCalm(true);
    hand.setHeld(true);
    hand.turn(0.5);
    expect(counted).toBe(0);
    const dragging = hand.step(DT, 0);
    hand.setHeld(false);
    const coasting = hand.step(DT, 0);
    expect(counted).toBeCloseTo(dragging + coasting);
    hand.setCalm(false);
    hand.step(DT, 0.99);
    expect(counted).toBeCloseTo(dragging + coasting);
  });

  it("resumes slow drift after a fling without counting ambient rotation", () => {
    let counted = 0;
    const hand = createSpinHandle((turn) => {
      counted += Math.abs(turn);
    });
    hand.setCalm(true);
    for (let i = 0; i < 300; i++) hand.step(DT, 0.045);
    expect(hand.state.velocity).toBeCloseTo(0.045, 4);
    expect(counted).toBe(0);
    hand.setHeld(true);
    hand.turn(-0.5);
    hand.step(DT, 0.045);
    hand.setHeld(false);
    expect(hand.step(DT, 0.045)).toBeLessThan(0);
    for (let i = 0; i < 600; i++) hand.step(DT, 0.045);
    expect(hand.state.velocity).toBeCloseTo(0.045, 4);
    const handTurned = counted;
    for (let i = 0; i < 600; i++) hand.step(DT, 0.045);
    expect(counted).toBe(handTurned);
  });

  it("pauses natural drift to read a mark and resumes when the pointer leaves", () => {
    const hand = createSpinHandle();
    hand.setCalm(true);
    for (let i = 0; i < 300; i++) hand.step(DT, 0.045);
    hand.state.paused = true;
    for (let i = 0; i < 300; i++) hand.step(DT, 0.045);
    expect(hand.state.velocity).toBeCloseTo(0, 4);
    hand.state.paused = false;
    expect(hand.step(DT, 0.045)).toBeGreaterThan(0);
    hand.setHeld(true);
    for (let i = 0; i < 300; i++) hand.step(DT, 0.045);
    expect(hand.state.velocity).toBeCloseTo(0, 4);
  });

  it("clears queued input when the close-up ends", () => {
    const hand = createSpinHandle();
    hand.setCalm(true);
    hand.setHeld(true);
    hand.turn(10);
    hand.setCalm(false);
    expect(hand.state.pending).toBe(0);
    expect(hand.state.held).toBe(false);
    expect(hand.step(DT, 0)).toBe(0);
  });
});
