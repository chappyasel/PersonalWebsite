// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { createIllustrationOverscroll } from "./illustrationOverscroll";

afterEach(() => vi.useRealTimers());
const offset = (element: HTMLElement) =>
  parseFloat(element.style.transform.replace("translateX(", "")) || 0;

it("responds on the next frame, resists repeated input, and returns without crossing centre", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  spring.push(-160);
  vi.advanceTimersByTime(16);
  expect(offset(content)).toBeGreaterThan(90);
  for (let i = 0; i < 20; i++) {
    spring.push(-100);
    vi.advanceTimersByTime(16);
    expect(offset(content)).toBeLessThan(220);
  }
  let before = offset(content);
  for (let i = 0; i < 90; i++) {
    vi.advanceTimersByTime(16);
    expect(offset(content)).toBeLessThanOrEqual(before);
    expect(offset(content)).toBeGreaterThanOrEqual(0);
    before = offset(content);
  }
  expect(content.style.transform).toBe("translateX(0px)");
  expect(vi.getTimerCount()).toBe(0);
});

it("settles while a decaying trackpad momentum tail is still arriving", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  for (let i = 0; i < 8; i++) {
    spring.push(-80);
    vi.advanceTimersByTime(16);
  }
  const peak = offset(content);
  for (let i = 0; i < 40; i++) {
    spring.push(-20 * Math.pow(0.8, i));
    vi.advanceTimersByTime(16);
  }
  expect(offset(content)).toBeLessThan(peak / 4);
  spring.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("consumes a reversal against the stretch before returning remaining travel", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  spring.push(-100);
  vi.advanceTimersByTime(16);
  const before = offset(content);
  expect(spring.consume(10)).toBe(0);
  vi.advanceTimersByTime(16);
  expect(offset(content)).toBeLessThan(before);
  expect(spring.consume(200)).toBeGreaterThan(0);
  vi.advanceTimersByTime(16);
  expect(content.style.transform).toBe("translateX(0px)");
  expect(vi.getTimerCount()).toBe(0);
});

it("doubles the stretch for the same pull", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  spring.push(-160);
  vi.advanceTimersByTime(16);
  // Previous resistance gave 48.89px before the return spring's first step.
  expect(offset(content)).toBeGreaterThan(90);
  spring.dispose();
});

it("paints one continuous return instead of jumping outward between animation frames", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  for (let i = 0; i < 8; i++) {
    spring.push(-80);
    vi.advanceTimersByTime(16);
  }
  vi.advanceTimersByTime(64);
  let previous = offset(content);
  const paint = vi.spyOn(content.style, "transform", "set");
  for (let i = 0; i < 40; i++) {
    const beforeInput = content.style.transform;
    spring.push(-2 * Math.pow(0.85, i));
    expect(content.style.transform).toBe(beforeInput);
    vi.advanceTimersByTime(16);
    expect(offset(content)).toBeLessThanOrEqual(previous);
    previous = offset(content);
  }
  expect(paint.mock.calls.length).toBeLessThanOrEqual(40);
  spring.dispose();
});

it("does not reverse the return on frames receiving a sparse momentum tail", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  for (let i = 0; i < 8; i++) {
    spring.push(-80);
    vi.advanceTimersByTime(16);
  }
  vi.advanceTimersByTime(64);
  let previous = offset(content);
  for (let i = 0; i < 20; i++) {
    // The display keeps ticking between wheel events. The previous regression
    // only delivered one wheel event per frame, masking alternating motion.
    vi.advanceTimersByTime(32);
    previous = offset(content);
    spring.push(-12 * Math.pow(0.92, i));
    vi.advanceTimersByTime(16);
    expect(offset(content)).toBeLessThanOrEqual(previous);
  }
  spring.dispose();
});

it("keeps a larger momentum packet in the existing gesture and accepts a new gesture", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  spring.push(-160);
  vi.advanceTimersByTime(112);
  spring.push(-8);
  vi.advanceTimersByTime(16);
  const returning = offset(content);
  spring.push(-80);
  vi.advanceTimersByTime(16);
  expect(offset(content)).toBeLessThan(returning);
  vi.advanceTimersByTime(200);
  spring.push(-160);
  vi.advanceTimersByTime(16);
  expect(offset(content)).toBeGreaterThan(90);
  spring.dispose();
});

it("does not restart the return when a fading momentum tail arrives in uneven batches", () => {
  vi.useFakeTimers();
  const content = document.createElement("div");
  const spring = createIllustrationOverscroll(content);
  for (let i = 0; i < 8; i++) {
    spring.push(-80);
    vi.advanceTimersByTime(16);
  }
  vi.advanceTimersByTime(64);
  for (const delta of [18, 5, 14, 4, 10, 3, 8, 2, 6, 1, 4, 0.5]) {
    const before = spring.getOffset();
    spring.push(-delta);
    // A larger packet inside a shrinking tail is not a fresh gesture.
    expect(spring.getOffset()).toBe(before);
    vi.advanceTimersByTime(48);
  }
  spring.dispose();
});

it.each([-1, 1])(
  "accepts repeated pulls at edge %s without waiting for momentum to stop",
  (direction) => {
    vi.useFakeTimers();
    const content = document.createElement("div");
    const spring = createIllustrationOverscroll(content);
    spring.push(direction * 160);
    vi.advanceTimersByTime(112);
    for (let swipe = 0; swipe < 3; swipe++) {
      for (const delta of [18, 5, 14, 4, 10, 3, 8, 2, 6, 1]) {
        spring.push(direction * delta);
        vi.advanceTimersByTime(16);
      }
      const before = Math.abs(spring.getOffset());
      for (const delta of [4, 16, 40, 80]) {
        spring.push(direction * delta);
        vi.advanceTimersByTime(16);
      }
      expect(Math.abs(spring.getOffset())).toBeGreaterThan(before + 30);
    }
    spring.dispose();
  },
);
