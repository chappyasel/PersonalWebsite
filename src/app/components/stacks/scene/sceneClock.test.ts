import { _roots, createRoot } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { overlayBackgroundMotion } from "~/lib/overlays/backgroundMotion";

import {
  preserveSceneClock,
  repaintFrozenScene,
  roomFrameDelta,
} from "./sceneClock";

let canvas: HTMLCanvasElement;
let state: RootState;
let ambientSpeed: ReturnType<typeof vi.fn<(delta: number) => number>>;

beforeEach(() => {
  // Exercise R3F's actual store and clock without creating a WebGL context.
  canvas = {} as HTMLCanvasElement;
  createRoot(canvas);
  state = _roots.get(canvas)!.store.getState();
  state.gl = { xr: { isPresenting: false } } as WebGLRenderer;
  ambientSpeed = vi.fn<(delta: number) => number>().mockReturnValue(1);
  preserveSceneClock(state, ambientSpeed);
});

afterEach(() => {
  overlayBackgroundMotion.setReducedMotion(true);
  overlayBackgroundMotion.setPaused(false);
  overlayBackgroundMotion.setReducedMotion(false);
  _roots.delete(canvas);
  vi.restoreAllMocks();
});

it("preserves the visible animation time across repeated modal pauses", () => {
  state.clock.elapsedTime = 120;
  for (let cycle = 0; cycle < 3; cycle++) {
    const elapsed = state.clock.elapsedTime;
    state.get().setFrameloop("never");
    expect(state.clock.elapsedTime).toBe(elapsed);
    expect(state.clock.running).toBe(false);
    state.get().setFrameloop("always");
    expect(state.clock.elapsedTime).toBe(elapsed);
    expect(state.clock.running).toBe(true);
    state.clock.elapsedTime += 1;
  }
});

it("resumes without counting time spent reading the modal", () => {
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  state.get().setFrameloop("always");
  state.clock.elapsedTime = 120;
  state.get().setFrameloop("never");
  now += 60_000;
  state.get().setFrameloop("always");
  now += 16;
  expect(state.clock.getDelta()).toBeCloseTo(0.016);
  expect(state.clock.elapsedTime).toBeCloseTo(120.016);
});

it("holds ambient time while supplying real delta to an inspected object's frames", () => {
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  overlayBackgroundMotion.setReducedMotion(true);
  overlayBackgroundMotion.setPaused(true);
  state.get().setFrameloop("always");
  state.clock.elapsedTime = 120;
  for (let frame = 0; frame < 10; frame++) {
    now += 16;
    expect(state.clock.getDelta()).toBeCloseTo(0.016);
    expect(state.clock.elapsedTime).toBe(120);
  }
  overlayBackgroundMotion.setPaused(false);
  now += 16;
  expect(state.clock.getDelta()).toBeCloseTo(0.016);
  expect(state.clock.elapsedTime).toBeCloseTo(120.016);
});

it("uses the same integrated time for shaders and simulation, while foreground delta stays real", () => {
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  state.get().setFrameloop("always");
  state.clock.elapsedTime = 120;
  overlayBackgroundMotion.setPaused(true);
  let ambient = 0;
  for (let frame = 0; frame < 100; frame++) {
    now += 16;
    const delta = state.clock.getDelta();
    expect(delta).toBeCloseTo(0.016);
    ambient += roomFrameDelta(state.clock, delta);
    expect(state.clock.elapsedTime).toBeCloseTo(120 + ambient);
  }
  expect(ambient).toBeCloseTo(0.75);
  state.get().setFrameloop("never");
  now += 60_000;
  overlayBackgroundMotion.setPaused(false);
  state.get().setFrameloop("always");
  now += 16;
  const delta = state.clock.getDelta();
  expect(delta).toBeCloseTo(0.016);
  expect(roomFrameDelta(state.clock, delta)).toBeGreaterThan(0);
  expect(roomFrameDelta(state.clock, delta)).toBeLessThan(delta);
  expect(state.clock.elapsedTime).toBeCloseTo(
    120.75 + roomFrameDelta(state.clock, delta),
  );
});

it("repaints a frozen resize without moving animation time", () => {
  state.clock.elapsedTime = 120;
  state.get().setFrameloop("never");
  const frame = vi.fn();
  const unsubscribe = state.internal.subscribe(
    { current: frame },
    0,
    _roots.get(canvas)!.store,
  );
  repaintFrozenScene(state);
  expect(frame).toHaveBeenCalledWith(state.get(), 0, undefined);
  expect(state.clock.elapsedTime).toBe(120);
  unsubscribe();
});

it("applies the orb boost to both animation clocks while an overlay can still stop them", () => {
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  ambientSpeed.mockReturnValue(2);
  state.get().setFrameloop("always");
  state.clock.elapsedTime = 120;
  now += 16;
  const realDelta = state.clock.getDelta();
  expect(realDelta).toBeCloseTo(0.016);
  expect(roomFrameDelta(state.clock, realDelta)).toBeCloseTo(0.032);
  expect(state.clock.elapsedTime).toBeCloseTo(120.032);
  overlayBackgroundMotion.setPaused(true);
  now += 1500;
  state.clock.getDelta();
  const pausedTime = state.clock.elapsedTime;
  now += 16;
  const pausedDelta = state.clock.getDelta();
  expect(pausedDelta).toBeCloseTo(0.016);
  expect(roomFrameDelta(state.clock, pausedDelta)).toBe(0);
  expect(state.clock.elapsedTime).toBe(pausedTime);
});

it("cancels a queued automatic frame when a modal freezes the room", () => {
  const requestFrame = vi.fn<typeof requestAnimationFrame>().mockReturnValue(1);
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const frame = vi.fn();
  const unsubscribe = state.internal.subscribe(
    { current: frame },
    0,
    _roots.get(canvas)!.store,
  );
  try {
    state.get().setFrameloop("always");
    state.clock.elapsedTime = 120;
    state.internal.active = true;
    state.invalidate();
    expect(state.internal.frames).toBeGreaterThan(0);
    const queuedFrame = requestFrame.mock.calls[0]![0];
    state.get().setFrameloop("never");

    // R3F's automatic loop supplies wall-clock milliseconds. A pending
    // invalidation must not render after switching to manual seconds.
    queuedFrame(500_000);
    expect(state.clock.elapsedTime).toBe(120);
    expect(frame).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    state.internal.active = false;
    vi.unstubAllGlobals();
  }
});
