// @vitest-environment jsdom
import { notifyRoomTakeover } from "../input/coarseTravelOwnership";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { homeTapMotion, homeTapPullback } from "./homeTapMotion";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  homeTapMotion.setEnabled(true);
});

afterEach(() => {
  homeTapMotion.cancel();
  homeTapMotion.setEnabled(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("pulls back subtly and settles exactly without leaving a frame loop running", () => {
  homeTapMotion.play();
  vi.advanceTimersByTime(100);
  expect(homeTapPullback(homeTapMotion.getOffset())).toBeGreaterThan(0.01);
  expect(homeTapPullback(homeTapMotion.getOffset())).toBeLessThanOrEqual(0.025);
  vi.advanceTimersByTime(1400);
  expect(homeTapPullback(homeTapMotion.getOffset())).toBe(0);
  expect(homeTapMotion.getSnapshot().active).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels when navigation takes over and never accumulates repeated home taps", () => {
  for (let i = 0; i < 10; i++) {
    notifyRoomTakeover();
    expect(homeTapMotion.getOffset()).toBe(0);
    homeTapMotion.play();
    vi.advanceTimersByTime(50);
    expect(homeTapPullback(homeTapMotion.getOffset())).toBeLessThanOrEqual(
      0.025,
    );
  }
  notifyRoomTakeover();
  expect(homeTapMotion.getSnapshot().active).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("stops immediately when disabled and schedules no disabled or reduced-motion animation", () => {
  homeTapMotion.play();
  vi.advanceTimersByTime(100);
  homeTapMotion.setEnabled(false);
  homeTapMotion.play();
  expect(homeTapMotion.getOffset()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  homeTapMotion.setEnabled(true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  homeTapMotion.play();
  expect(homeTapMotion.getSnapshot().active).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
