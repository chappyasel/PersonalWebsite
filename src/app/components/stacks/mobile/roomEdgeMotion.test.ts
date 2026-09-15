// @vitest-environment jsdom
import { notifyRoomTakeover } from "../input/coarseTravelOwnership";
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  applyRoomEdgeCameraRotation,
  createRoomEdgeMotion,
  searchFreezesRoom,
} from "./roomEdgeMotion";

let motion: ReturnType<typeof createRoomEdgeMotion>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  motion = createRoomEdgeMotion();
});
afterEach(() => {
  motion.cancel();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("turns the camera without translating it", () => {
  const camera = new PerspectiveCamera();
  camera.position.set(1, 2, 3);
  const position = camera.position.clone();
  const orientation = camera.quaternion.clone();
  applyRoomEdgeCameraRotation(camera, 0.1);
  expect(camera.position.equals(position)).toBe(true);
  expect(camera.quaternion.angleTo(orientation)).toBeGreaterThan(0);
});

it("does not jump on individual wheel events in a decaying momentum tail", () => {
  motion.pull(120);
  for (const delta of [48, 31, 19, 10, 5, 2, 1]) {
    vi.advanceTimersByTime(23);
    const before = motion.getOffset();
    motion.pull(delta);
    expect(motion.getOffset()).toBeCloseTo(before, 10);
  }
});

it("samples the current render time between animation callbacks", () => {
  motion.play();
  vi.advanceTimersByTime(7);
  const first = motion.getOffset();
  expect(first).toBeGreaterThan(0);
  expect(motion.getOffset()).toBe(first);
  vi.advanceTimersByTime(5);
  expect(motion.getOffset()).toBeGreaterThan(first);
});

it("lets a shrinking wheel tail keep returning instead of kicking outward again", () => {
  motion.pull(120);
  vi.advanceTimersByTime(160);
  for (const delta of [6, 4, 2, 1, 1]) {
    const before = motion.getOffset();
    motion.pull(delta);
    vi.advanceTimersByTime(23);
    expect(motion.getOffset()).toBeLessThan(before);
  }
});

it.each([-1, 1])(
  "makes one excursion through an uneven momentum tail at edge %s",
  (direction) => {
    motion.pull(direction * 120);
    vi.advanceTimersByTime(160);
    for (const delta of [6, 18, 4, 22, 2, 12, 1, 8]) {
      const before = Math.abs(motion.getOffset());
      motion.pull(direction * delta);
      for (let frame = 0; frame < 3; frame++) {
        const previous = Math.abs(motion.getOffset());
        vi.advanceTimersByTime(16);
        expect(Math.abs(motion.getOffset())).toBeLessThanOrEqual(previous);
      }
      expect(Math.abs(motion.getOffset())).toBeLessThan(before);
    }
    // A separate swipe can still start another excursion during the return.
    vi.advanceTimersByTime(200);
    const before = Math.abs(motion.getOffset());
    motion.pull(direction * 120);
    vi.advanceTimersByTime(32);
    expect(Math.abs(motion.getOffset())).toBeGreaterThan(before);
  },
);

it("rotates the camera left, returns exactly home, then allows Search to freeze it", () => {
  motion.play();
  expect(searchFreezesRoom(true, motion.getSnapshot().active)).toBe(false);
  vi.advanceTimersByTime(100);
  const camera = new PerspectiveCamera();
  applyRoomEdgeCameraRotation(camera, motion.getOffset());
  expect(camera.rotation.y).toBeGreaterThan(0.02);
  vi.advanceTimersByTime(1200);
  expect(motion.getOffset()).toBe(0);
  const resting = new PerspectiveCamera();
  applyRoomEdgeCameraRotation(resting, motion.getOffset());
  expect(resting.rotation.y).toBe(0);
  expect(searchFreezesRoom(true, motion.getSnapshot().active)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([-1, 1])(
  "accepts a new swipe that starts gently during the previous return at edge %s",
  (direction) => {
    motion.pull(direction * 120);
    vi.advanceTimersByTime(160);
    motion.pull(direction * 6);
    vi.advanceTimersByTime(200);
    motion.pull(direction);
    vi.advanceTimersByTime(16);
    const before = Math.abs(motion.getOffset());
    motion.pull(direction * 30);
    vi.advanceTimersByTime(16);
    motion.pull(direction * 60);
    vi.advanceTimersByTime(32);
    expect(Math.abs(motion.getOffset())).toBeGreaterThan(before);
  },
);

it.each([-1, 1])(
  "repeats at the same edge after settling without cancellation: %s",
  (direction) => {
    for (let gesture = 0; gesture < 3; gesture++) {
      motion.pull(direction * 120);
      vi.advanceTimersByTime(120);
      expect(Math.abs(motion.getOffset())).toBeGreaterThan(0.05);
      motion.pull(direction * 6);
      vi.advanceTimersByTime(1600);
      expect(motion.getSnapshot().active).toBe(false);
      expect(motion.getOffset()).toBe(0);
    }
  },
);

it.each([-1, 1])(
  "recognizes another swipe ramp without a quiet gap in momentum: %s",
  (direction) => {
    motion.pull(direction * 120);
    vi.advanceTimersByTime(160);
    for (const delta of [6, 4, 2, 1]) {
      motion.pull(direction * delta);
      vi.advanceTimersByTime(16);
    }
    const before = Math.abs(motion.getOffset());
    for (const delta of [4, 16, 40, 80]) {
      motion.pull(direction * delta);
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(32);
    expect(Math.abs(motion.getOffset())).toBeGreaterThan(before);
  },
);

it("shows resisted travel before committing Search and returns if the scroll stops", () => {
  motion.pull(30);
  vi.advanceTimersByTime(32);
  const first = motion.getOffset();
  expect(first).toBeGreaterThan(0);
  motion.pull(3000);
  vi.advanceTimersByTime(80);
  expect(motion.getOffset()).toBeGreaterThan(first);
  expect(motion.getOffset()).toBeLessThanOrEqual(0.18);
  vi.advanceTimersByTime(2000);
  expect(motion.getOffset()).toBe(0);
  expect(motion.getSnapshot().active).toBe(false);
});

it.each([-1, 1])(
  "returns without pausing at the peak or oscillating at edge %s",
  (direction) => {
    motion.pull(direction * 120);
    const samples: number[] = [];
    for (let frame = 0; frame < 90; frame++) {
      vi.advanceTimersByTime(16);
      samples.push(Math.abs(motion.getOffset()));
    }
    const peak = samples.indexOf(Math.max(...samples));
    expect(peak).toBeLessThan(10);
    for (let index = peak + 1; index < samples.length; index++) {
      if (samples[index - 1]! > 0)
        expect(samples[index]).toBeLessThan(samples[index - 1]!);
      else expect(samples[index]).toBe(0);
    }
  },
);

it("opening Search during a stretch does not restart or hold its return", () => {
  motion.pull(120);
  vi.advanceTimersByTime(160);
  const before = motion.getOffset();
  motion.play();
  vi.advanceTimersByTime(16);
  expect(motion.getOffset()).toBeLessThan(before);
});

it.each([-1, 1])("resists and returns from either edge: %s", (direction) => {
  motion.pull(direction * 120);
  vi.advanceTimersByTime(100);
  expect(Math.sign(motion.getOffset())).toBe(direction);
  const camera = new PerspectiveCamera();
  applyRoomEdgeCameraRotation(camera, motion.getOffset());
  expect(Math.sign(camera.rotation.y)).toBe(direction);
  const remaining = motion.consume(direction * 30);
  expect(remaining).toBe(0);
  vi.advanceTimersByTime(2000);
  expect(motion.getOffset()).toBe(0);
});

it("has no animation when disabled or reduced motion is requested", () => {
  motion.setEnabled(false);
  motion.play();
  motion.pull(100);
  expect(motion.getOffset()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  motion.setEnabled(true);
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
  } as MediaQueryList);
  motion.play();
  motion.pull(100);
  expect(motion.getSnapshot().active).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("clears the excursion when another destination takes over", () => {
  motion.play();
  vi.advanceTimersByTime(150);
  notifyRoomTakeover();
  expect(motion.getOffset()).toBe(0);
  expect(motion.getSnapshot().active).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
