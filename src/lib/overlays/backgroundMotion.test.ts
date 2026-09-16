import { expect, it, vi } from "vitest";

import {
  createOverlayBackgroundMotion,
  OVERLAY_BACKGROUND_RAMP_SECONDS as duration,
} from "./backgroundMotion";

it("slows continuously to rest, then starts accelerating at dismissal", () => {
  const motion = createOverlayBackgroundMotion();
  motion.setPaused(true);
  expect(motion.getSpeed()).toBe(1);
  expect(motion.getSnapshot()).toMatchObject({ active: true, paused: false });
  const first = motion.advance(duration / 2);
  expect(motion.getSpeed()).toBeCloseTo(0.5);
  const second = motion.advance(duration / 2);
  expect(first).toBeGreaterThan(second);
  expect(first + second).toBeCloseTo(duration / 2);
  expect(motion.getSnapshot()).toMatchObject({ active: false, paused: true });
  expect(motion.advance(60)).toBe(0);
  motion.setPaused(false);
  expect(motion.getSnapshot()).toMatchObject({ active: true, paused: false });
  expect(motion.advance(0.016)).toBeGreaterThan(0);
  motion.advance(duration);
  expect(motion.getSpeed()).toBe(1);
});

it("integrates the same scene time at different frame rates and across a long frame", () => {
  const run = (frames: number) => {
    const motion = createOverlayBackgroundMotion();
    motion.setPaused(true);
    let time = 0;
    for (let frame = 0; frame < frames; frame++)
      time += motion.advance(2 / frames);
    motion.setPaused(false);
    for (let frame = 0; frame < frames; frame++)
      time += motion.advance(2 / frames);
    return time;
  };
  expect(run(1)).toBeCloseTo(2);
  expect(run(30)).toBeCloseTo(run(144), 10);
});

it("reverses from the current speed without snapping or restarting for nested overlays", () => {
  const motion = createOverlayBackgroundMotion();
  motion.setPaused(true);
  motion.advance(duration / 2);
  motion.setPaused(true);
  motion.advance(duration / 4);
  expect(Math.abs(motion.getSpeed() - 0.25)).toBeLessThan(0.05);
  const speed = motion.getSpeed();
  motion.setPaused(false);
  expect(motion.getSpeed()).toBe(speed);
  motion.advance(duration / 2);
  const returning = motion.getSpeed();
  expect(returning).toBeGreaterThan(speed);
  motion.setPaused(true);
  expect(motion.getSpeed()).toBe(returning);
  motion.advance(duration);
  expect(motion.getSpeed()).toBe(0);
});

it("keeps the middle nearly linear and softens both endpoints", () => {
  const motion = createOverlayBackgroundMotion();
  motion.setPaused(true);
  motion.advance(duration * 0.01);
  expect(1 - motion.getSpeed()).toBeLessThan(0.001);
  motion.advance(duration * 0.24);
  const quarter = motion.getSpeed();
  expect(Math.abs(quarter - 0.75)).toBeLessThan(0.05);
  motion.advance(duration * 0.25);
  const half = motion.getSpeed();
  motion.advance(duration * 0.25);
  const threeQuarters = motion.getSpeed();
  expect(quarter - half).toBeCloseTo(half - threeQuarters);
  motion.advance(duration * 0.24);
  expect(motion.getSpeed()).toBeGreaterThan(0);
  expect(motion.getSpeed()).toBeLessThan(0.001);
});

it("cancels a partial slowdown by retracing it, without taking another full second", () => {
  const motion = createOverlayBackgroundMotion();
  motion.setPaused(true);
  const openingTime = motion.advance(duration * 0.35);
  const openingSpeed = motion.getSpeed();
  motion.setPaused(false);
  expect(motion.getSpeed()).toBe(openingSpeed);
  const closingTime = motion.advance(duration * 0.35);
  expect(motion.getSpeed()).toBe(1);
  expect(motion.getSnapshot().active).toBe(false);
  expect(closingTime).toBeCloseTo(openingTime);
});

it("supports repeated reversals without drifting or overshooting", () => {
  const motion = createOverlayBackgroundMotion();
  motion.setPaused(true);
  motion.advance(duration * 0.5);
  const middle = motion.getSpeed();
  for (let cycle = 0; cycle < 20; cycle++) {
    motion.setPaused(false);
    expect(motion.getSpeed()).toBeCloseTo(middle);
    motion.advance(duration * 0.1);
    const speed = motion.getSpeed();
    expect(speed).toBeGreaterThan(middle);
    expect(speed).toBeLessThan(1);
    motion.setPaused(true);
    expect(motion.getSpeed()).toBe(speed);
    motion.advance(duration * 0.1);
    expect(motion.getSpeed()).toBeCloseTo(middle);
  }
  motion.advance(duration * 0.5);
  expect(motion.getSnapshot().paused).toBe(true);
});

it("publishes only transition boundaries rather than every frame", () => {
  const motion = createOverlayBackgroundMotion();
  const listener = vi.fn();
  motion.subscribe(listener);
  motion.setPaused(true);
  for (let frame = 0; frame < 200; frame++) motion.advance(0.01);
  expect(listener).toHaveBeenCalledTimes(2);
  motion.setPaused(false);
  expect(listener).toHaveBeenCalledTimes(3);
});

it.each(["disabled", "reduced"])(
  "bypasses easing when %s, including during a ramp",
  (mode) => {
    const motion = createOverlayBackgroundMotion();
    motion.setPaused(true);
    motion.advance(duration / 3);
    if (mode === "disabled") motion.setEnabled(false);
    else motion.setReducedMotion(true);
    expect(motion.getSnapshot()).toMatchObject({ active: false, paused: true });
    expect(motion.advance(1)).toBe(0);
    motion.setPaused(false);
    expect(motion.advance(1)).toBe(1);
  },
);
