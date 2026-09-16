import { expect, it } from "vitest";

import { createCoordinationSceneMotion } from "./coordinationSceneMotion";

it("eases the shared scene toward twice speed and reverses without a jump", () => {
  const motion = createCoordinationSceneMotion();
  const start = motion.advance(0.016, true);
  expect(start).toBeGreaterThan(1);
  expect(start).toBeLessThan(1.1);
  motion.advance(2, true);
  const full = motion.advance(0.016, true);
  expect(full).toBeCloseTo(2, 3);
  const returning = motion.advance(0.016, false);
  expect(returning).toBeLessThan(full);
  expect(returning).toBeGreaterThan(1.9);
  motion.advance(3, false);
  expect(motion.advance(0.016, false)).toBe(1);
});

it("integrates consistently at different frame rates", () => {
  const run = (frames: number) => {
    const motion = createCoordinationSceneMotion();
    let time = 0;
    for (let frame = 0; frame < frames; frame++)
      time += motion.advance(1 / frames, true) / frames;
    return time;
  };
  expect(run(30)).toBeCloseTo(run(144), 10);
});

it("bypasses all boost work when disabled or reduced motion is requested", () => {
  const motion = createCoordinationSceneMotion();
  motion.advance(1, true);
  motion.setEnabled(false);
  expect(motion.advance(1, true)).toBe(1);
  motion.setEnabled(true);
  expect(motion.advance(1, true, false)).toBe(1);
});
