// @vitest-environment jsdom
import { _roots, context, createRoot } from "@react-three/fiber";
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import SceneClockBoundary from "./SceneClockBoundary";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("protects an existing renderer through Strict Mode replays and parked-room effect cleanup", () => {
  const canvas = {} as HTMLCanvasElement;
  createRoot(canvas);
  const store = _roots.get(canvas)!.store;
  const state = store.getState();
  state.gl = { xr: { isPresenting: false } } as WebGLRenderer;
  state.clock.elapsedTime = 120;
  try {
    const view = render(
      <StrictMode>
        <context.Provider value={store}>
          <SceneClockBoundary />
        </context.Provider>
      </StrictMode>,
    );
    store.getState().setFrameloop("never");
    store.getState().setFrameloop("always");
    expect(state.clock.elapsedTime).toBe(120);
    view.unmount();
    store.getState().setFrameloop("never");
    store.getState().setFrameloop("always");
    expect(state.clock.elapsedTime).toBe(120);
  } finally {
    _roots.delete(canvas);
  }
});
