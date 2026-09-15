// @vitest-environment jsdom
import { roomEdgeMotion } from "../mobile/roomEdgeMotion";
import { useStacks } from "../store";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { openUniversalSearch } from "~/components/universal-search/UniversalSearchController";

import { mobileSheetHorizontalSwipeIntent } from "./mobileSheetGeometry";
import { useSheetNavigation } from "./useSheetNavigation";

vi.mock("~/components/universal-search/UniversalSearchController", () => ({
  openUniversalSearch: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.mocked(openUniversalSearch).mockClear();
  history.replaceState(null, "", "/#about");
  useStacks.setState({
    activeUnit: 0,
    modalOpen: false,
    dragging: null,
    panelState: "closed",
    visionRidePhase: "idle",
    travelTo: null,
  });
});
afterEach(() => {
  cleanup();
  roomEdgeMotion.cancel();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["closed", "open"] as const)(
  "opens Search on a rightward About sheet swipe while %s",
  (panelState) => {
    useStacks.setState({ panelState });
    const hook = renderHook(useSheetNavigation);
    const direction = mobileSheetHorizontalSwipeIntent({
      deltaX: 80,
      velocityX: 0.2,
    });
    act(() => {
      if (direction) hook.result.current(direction);
    });
    expect(openUniversalSearch).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(100));
    expect(roomEdgeMotion.getOffset()).toBeGreaterThan(0.06);
    const peak = roomEdgeMotion.getOffset();
    act(() => void vi.advanceTimersByTime(100));
    expect(roomEdgeMotion.getOffset()).toBeLessThan(peak);
    act(() => void vi.advanceTimersByTime(1200));
    expect(roomEdgeMotion.getOffset()).toBe(0);
    expect(useStacks.getState().activeUnit).toBe(0);
    expect(location.hash).toBe("#about");
  },
);

it("keeps adjacent shelf navigation and the last shelf boundary", () => {
  const hook = renderHook(useSheetNavigation);
  act(() => {
    hook.result.current(1);
  });
  expect(useStacks.getState().activeUnit).toBe(1);
  act(() => {
    hook.result.current(-1);
  });
  expect(useStacks.getState().activeUnit).toBe(0);
  useStacks.setState({ activeUnit: 6 });
  act(() => {
    hook.result.current(1);
  });
  expect(useStacks.getState().activeUnit).toBe(6);
  expect(openUniversalSearch).not.toHaveBeenCalled();
});
