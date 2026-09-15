// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { wheelStepGesture } from "./wheelStepGesture";

afterEach(() => vi.useRealTimers());

it("accumulates small deltas and keeps momentum from switching another panel", () => {
  vi.useFakeTimers();
  const step = vi.fn();
  const wheel = wheelStepGesture(step);
  const event = new WheelEvent("wheel", { deltaX: -24 });
  wheel(event, true);
  wheel(event, true);
  expect(step).not.toHaveBeenCalled();
  wheel(event, true);
  expect(step).toHaveBeenCalledExactlyOnceWith(-1);
  for (let index = 0; index < 20; index++) {
    vi.advanceTimersByTime(16);
    wheel(event, true);
  }
  expect(step).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(200);
  wheel(new WheelEvent("wheel", { deltaX: 90 }), true);
  expect(step).toHaveBeenLastCalledWith(1);
  expect(step).toHaveBeenCalledTimes(2);
});

it("cancels on reversal, zoom, vertical intent, or another interaction taking over", () => {
  vi.useFakeTimers();
  const step = vi.fn();
  for (const [event, enabled] of [
    [new WheelEvent("wheel", { deltaX: 12 }), true],
    [new WheelEvent("wheel", { deltaX: -12, ctrlKey: true }), true],
    [new WheelEvent("wheel", { deltaY: 12 }), true],
    [new WheelEvent("wheel", { deltaX: -12 }), false],
  ] as const) {
    const wheel = wheelStepGesture(step);
    wheel(new WheelEvent("wheel", { deltaX: -24 }), true);
    wheel(event, enabled);
    wheel(new WheelEvent("wheel", { deltaX: -120 }), true);
  }
  expect(step).not.toHaveBeenCalled();
});

it("recognizes a fresh swipe at the edge while arrival momentum is still running", () => {
  vi.useFakeTimers();
  const step = vi.fn();
  const wheel = wheelStepGesture(step, "world");
  wheel(new WheelEvent("wheel", { deltaY: -120 }), false);
  for (const delta of [24, 6, 18, 4, 22, 2, 12, 1]) {
    vi.advanceTimersByTime(16);
    wheel(new WheelEvent("wheel", { deltaY: -delta }), true);
  }
  expect(step).not.toHaveBeenCalled();
  for (const delta of [4, 16, 40, 80]) {
    vi.advanceTimersByTime(16);
    wheel(new WheelEvent("wheel", { deltaY: -delta }), true);
  }
  expect(step).toHaveBeenCalledExactlyOnceWith(-1);
});

it("does not let a zero-delta packet cancel an outward swipe", () => {
  vi.useFakeTimers();
  const step = vi.fn();
  const wheel = wheelStepGesture(step, "world");
  for (const delta of [-24, 0, -24, -24])
    wheel(new WheelEvent("wheel", { deltaX: delta }), delta !== 0);
  expect(step).toHaveBeenCalledExactlyOnceWith(-1);
});

it("does not step twice while the same swipe is still accelerating", () => {
  vi.useFakeTimers();
  const step = vi.fn();
  const wheel = wheelStepGesture(step);
  for (const delta of [4, 16, 40, 80, 100, 120, 140, 24, 6, 18, 4, 22, 2]) {
    vi.advanceTimersByTime(16);
    wheel(new WheelEvent("wheel", { deltaX: -delta }), true);
  }
  expect(step).toHaveBeenCalledExactlyOnceWith(-1);
});
