// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useMobileSheetScrollFade } from "./useMobileSheetScrollFade";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("builds gradually during the first scroll, follows a flick, and clears at the top", () => {
  const scroller = document.createElement("div");
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1200 },
    clientHeight: { value: 500 },
  });
  const ref = { current: scroller };
  const { result, rerender } = renderHook(
    ({ active }) => useMobileSheetScrollFade(ref, active),
    { initialProps: { active: true } },
  );
  const scroll = (top: number) =>
    act(() => {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    });
  expect(result.current.progress.get()).toBe(0);
  scroll(12);
  expect(result.current.progress.get()).toBeGreaterThan(0);
  expect(result.current.progress.get()).toBeLessThan(0.15);
  scroll(36);
  expect(result.current.progress.get()).toBeGreaterThan(0.3);
  expect(result.current.progress.get()).toBeLessThan(0.7);
  scroll(400);
  expect(result.current.progress.get()).toBe(1);
  scroll(-10);
  expect(result.current.progress.get()).toBe(0);
  scroll(400);
  rerender({ active: false });
  expect(result.current.progress.get()).toBe(0);
  scroll(100);
  expect(result.current.progress.get()).toBe(0);
  rerender({ active: true });
  expect(result.current.progress.get()).toBe(1);
});

it("keeps a short card's resting fade during overscroll", () => {
  const scroller = document.createElement("div");
  Object.defineProperties(scroller, {
    scrollHeight: { value: 500 },
    clientHeight: { value: 500 },
  });
  scroller.scrollTop = 30;
  const { result } = renderHook(() =>
    useMobileSheetScrollFade({ current: scroller }, true),
  );
  expect(result.current.progress.get()).toBe(0);
});

it("keeps the clipping edge transparent throughout the scroll transition", async () => {
  const scroller = document.createElement("div");
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1200 },
    clientHeight: { value: 500 },
  });
  const ref = { current: scroller };
  const { result } = renderHook(() => useMobileSheetScrollFade(ref, true));
  for (const top of [0, 1, 12, 24, 36, 72, 400, 12, 0]) {
    act(() => {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    });
    await waitFor(() => {
      const stops = Array.from(
        result.current.mask
          .get()
          .matchAll(/rgb\(0 0 0 \/ ([\d.]+)\) ([\d.]+)px/g),
        (match) => ({ alpha: Number(match[1]), position: Number(match[2]) }),
      );
      expect(stops[0]).toEqual({ alpha: 0, position: 0 });
      expect(stops.at(-1)?.alpha).toBe(1);
      // At rest the fade fits in the padding, leaving the first card clear.
      if (top === 0) expect(stops.at(-1)?.position).toBe(24);
      if (top >= 72) expect(stops.at(-1)?.position).toBe(72);
    });
  }
});
