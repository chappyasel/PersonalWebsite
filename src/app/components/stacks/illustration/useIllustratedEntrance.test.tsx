// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useIllustratedEntrance } from "./useIllustratedEntrance";

let reduceMotion = false;
let motion: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion = false;
  motion = new EventTarget();
  Object.defineProperty(motion, "matches", { get: () => reduceMotion });
  vi.stubGlobal("matchMedia", () => motion);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("introduces content before navigation and completes without waiting for 3D", () => {
  const view = renderHook(() => useIllustratedEntrance(true));
  expect(view.result.current).toBe("shelf");
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(view.result.current).toBe("content");
  act(() => {
    vi.advanceTimersByTime(320);
  });
  expect(view.result.current).toBe("navigation");
  act(() => {
    vi.advanceTimersByTime(240);
  });
  expect(view.result.current).toBe("complete");
  expect(vi.getTimerCount()).toBe(0);
});

it("does not replay after shelf rerenders, delayed assets, retry, or a resident room return", () => {
  const view = renderHook(({ enabled }) => useIllustratedEntrance(enabled), {
    initialProps: { enabled: true, shelf: 0, retry: 0 },
  });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  view.rerender({ enabled: true, shelf: 1, retry: 0 });
  expect(view.result.current).toBe("content");
  act(() => {
    vi.advanceTimersByTime(440);
  });
  view.rerender({ enabled: true, shelf: 4, retry: 1 });
  expect(view.result.current).toBe("complete");
  view.rerender({ enabled: false, shelf: 4, retry: 1 });
  view.rerender({ enabled: true, shelf: 4, retry: 2 });
  expect(view.result.current).toBe("complete");
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["pointerdown", "touchstart", "wheel", "keydown"])(
  "settles immediately on %s without consuming the interaction",
  (type) => {
    const view = renderHook(() => useIllustratedEntrance(true));
    const event = new Event(type, { bubbles: true, cancelable: true });
    fireEvent(window, event);
    expect(view.result.current).toBe("complete");
    expect(event.defaultPrevented).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("skips the entrance for reduced motion and reacts to preference changes", () => {
  reduceMotion = true;
  const first = renderHook(() => useIllustratedEntrance(true));
  expect(first.result.current).toBe("complete");
  expect(vi.getTimerCount()).toBe(0);
  first.unmount();
  reduceMotion = false;
  const second = renderHook(() => useIllustratedEntrance(true));
  act(() => {
    reduceMotion = true;
    motion.dispatchEvent(new Event("change"));
  });
  expect(second.result.current).toBe("complete");
  expect(vi.getTimerCount()).toBe(0);
});

it("survives Strict Mode effect cleanup and removes timers on unmount", () => {
  const view = renderHook(() => useIllustratedEntrance(true), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    ),
  });
  act(() => {
    vi.advanceTimersByTime(180);
  });
  expect(view.result.current).toBe("content");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("starts when the room mounts and resumes elapsed time after a brief suspension", () => {
  const view = renderHook(({ enabled }) => useIllustratedEntrance(enabled), {
    initialProps: { enabled: false },
  });
  expect(vi.getTimerCount()).toBe(0);
  view.rerender({ enabled: true });
  expect(view.result.current).toBe("shelf");
  act(() => {
    vi.advanceTimersByTime(200);
  });
  view.rerender({ enabled: false });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  view.rerender({ enabled: true });
  expect(view.result.current).toBe("navigation");
  act(() => {
    vi.advanceTimersByTime(140);
  });
  expect(view.result.current).toBe("complete");
});
