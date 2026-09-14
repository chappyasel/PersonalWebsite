import { _roots, createRoot } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { preserveSceneClock, repaintFrozenScene } from "./sceneClock";

let canvas: HTMLCanvasElement;
let state: RootState;

beforeEach(() => {
  // Exercise R3F's actual store and clock without creating a WebGL context.
  canvas = {} as HTMLCanvasElement;
  createRoot(canvas);
  state = _roots.get(canvas)!.store.getState();
  state.gl = { xr: { isPresenting: false } } as WebGLRenderer;
  preserveSceneClock(state);
});

afterEach(() => {
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
