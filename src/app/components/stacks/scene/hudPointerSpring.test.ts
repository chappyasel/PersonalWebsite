import { expect, it } from "vitest";

import { advanceHudPointerSpring } from "./hudCameraDriftControl";

it("carries velocity through a pointer reversal and settles without bounce", () => {
  const state = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < 6; i++) advanceHudPointerSpring(state, 12, -12, 1 / 60);
  const before = state.x;
  expect(state.vx).toBeGreaterThan(0);
  advanceHudPointerSpring(state, -12, 12, 1 / 60);
  expect(state.x).toBeGreaterThan(before);
  for (let i = 0; i < 180; i++) {
    advanceHudPointerSpring(state, -12, 12, 1 / 60);
    expect(Math.abs(state.x)).toBeLessThanOrEqual(12);
    expect(Math.abs(state.y)).toBeLessThanOrEqual(12);
  }
  expect(state).toEqual({ x: -12, y: 12, vx: 0, vy: 0 });
});

it("matches at 60Hz and 120Hz and limits a resumed frame", () => {
  const run = (hz: number) => {
    const state = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < hz / 4; i++)
      advanceHudPointerSpring(state, 12, 6, 1 / hz);
    return state;
  };
  const state = run(60);
  expect(state.x).toBeCloseTo(run(120).x, 10);
  const before = state.x;
  advanceHudPointerSpring(state, -12, -6, 2);
  expect(Math.abs(state.x - before)).toBeLessThan(1);
});
