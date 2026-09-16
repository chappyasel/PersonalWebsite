// @vitest-environment jsdom
import { _roots, createRoot } from "@react-three/fiber";
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import type { WebGLRenderer } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";
import { overlayBackgroundMotion } from "~/lib/overlays/backgroundMotion";
import { registerOverlay } from "~/lib/overlays/coordinator";

import { useOverlayState } from "./OverlayPresence";
import { useOverlayBackgroundMotion } from "./useOverlayBackgroundMotion";
import {
  preserveSceneClock,
  roomFrameDelta,
} from "~/app/components/stacks/scene/sceneClock";

let media: EventTarget & { matches: boolean };
const leases: ReturnType<typeof registerOverlay>[] = [];
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  const desktop = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal("matchMedia", (query: string) =>
    query.includes("prefers-reduced-motion") ? media : desktop,
  );
  localStorage.clear();
  desktopMotionPreference.setReduced(false);
});
afterEach(() => {
  cleanup();
  leases.splice(0).forEach((lease) => lease.release());
  overlayBackgroundMotion.setEnabled(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function open(kind: Parameters<typeof registerOverlay>[0]["kind"] = "video") {
  let lease!: ReturnType<typeof registerOverlay>;
  act(() => {
    lease = registerOverlay({ kind, settled: false, dismiss: vi.fn() });
    leases.push(lease);
  });
  return lease;
}
function usePause() {
  const motion = useOverlayBackgroundMotion();
  const overlay = useOverlayState();
  return { motion, overlay, freeze: motion.paused && overlay.freezeRoom };
}

it("keeps drawing progressively slower frames for the full 1.5-second entrance", () => {
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const canvas = {} as HTMLCanvasElement;
  createRoot(canvas);
  const state = _roots.get(canvas)!.store.getState();
  state.gl = { xr: { isPresenting: false } } as WebGLRenderer;
  preserveSceneClock(state);
  state.get().setFrameloop("always");
  const { result } = renderHook(usePause);
  const overlay = open();
  act(() => overlay.settle());
  try {
    let previous = 1;
    for (let frame = 1; frame <= 90; frame++) {
      now += 1000 / 60;
      let delta = 0;
      act(() => {
        delta = state.clock.getDelta();
      });
      const speed = roomFrameDelta(state.clock, delta) / delta;
      expect(speed).toBeGreaterThan(0);
      expect(speed).toBeLessThan(previous);
      if (frame < 90) expect(result.current.freeze).toBe(false);
      previous = speed;
    }
    act(() => {
      now += 1;
      state.clock.getDelta();
    });
    expect(result.current.freeze).toBe(true);
  } finally {
    _roots.delete(canvas);
  }
});

it("slows from entrance, sleeps only after settling, and wakes on Escape before release", () => {
  const { result } = renderHook(usePause);
  const video = open();
  expect(result.current.motion.active).toBe(true);
  expect(result.current.freeze).toBe(false);
  act(() => video.settle());
  expect(result.current.freeze).toBe(false);
  act(() => {
    overlayBackgroundMotion.advance(1.5);
  });
  expect(result.current.freeze).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(result.current.freeze).toBe(false);
  expect(result.current.motion.active).toBe(true);
  expect(result.current.overlay.blockRoom).toBe(true);
  expect(result.current.overlay.depth).toBe(1);
  act(() => {
    overlayBackgroundMotion.advance(0.016);
  });
  expect(overlayBackgroundMotion.getSpeed()).toBeGreaterThan(0);
});

it("holds nested parents and reverses an interrupted dismissal from its current speed", () => {
  const { result } = renderHook(usePause);
  const album = open("album");
  act(() => {
    album.settle();
    overlayBackgroundMotion.advance(1.5);
  });
  const child = open();
  act(() => child.update("closing"));
  expect(result.current.motion.paused).toBe(true);
  act(() => child.release());
  expect(result.current.freeze).toBe(true);
  act(() => album.update("closing"));
  act(() => {
    overlayBackgroundMotion.advance(0.15);
  });
  const speed = overlayBackgroundMotion.getSpeed();
  open();
  expect(overlayBackgroundMotion.getSpeed()).toBe(speed);
  act(() => {
    overlayBackgroundMotion.advance(0.15);
  });
  expect(overlayBackgroundMotion.getSpeed()).toBeLessThan(speed);
});

it.each(["system", "site", "diagnostics"])(
  "bypasses the ramp for the %s setting",
  (setting) => {
    const { result } = renderHook(usePause);
    open();
    act(() => {
      if (setting === "site") desktopMotionPreference.setReduced(true);
      else if (setting === "diagnostics")
        overlayBackgroundMotion.setEnabled(false);
      else {
        media.matches = true;
        media.dispatchEvent(new Event("change"));
      }
    });
    expect(result.current.motion).toMatchObject({
      paused: true,
      active: false,
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(overlayBackgroundMotion.getSpeed()).toBe(1);
  },
);
