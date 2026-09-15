// @vitest-environment jsdom
import {
  applyRoomEdgeCameraRotation,
  roomEdgeMotion,
} from "../mobile/roomEdgeMotion";
import { STACKS_MOBILE_QUERY } from "../scene/worldLayout";
import { useStacks } from "../store";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { openUniversalSearch } from "~/components/universal-search/UniversalSearchController";

import ScrollBridges from "./ScrollBridges";

vi.mock("~/components/universal-search/UniversalSearchController", () => ({
  openUniversalSearch: vi.fn(),
}));

let element: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: query === STACKS_MOBILE_QUERY })),
  );
  vi.mocked(openUniversalSearch).mockClear();
  element = document.createElement("div");
  document.body.append(element);
  Object.defineProperties(element, {
    scrollWidth: { value: 3120 },
    clientWidth: { value: 780 },
  });
  useStacks.setState({
    scrollEl: element,
    activeUnit: 0,
    dragging: null,
    modalOpen: false,
    panelState: "closed",
    visionRidePhase: "idle",
  });
  render(<ScrollBridges />);
});
afterEach(() => {
  cleanup();
  roomEdgeMotion.cancel();
  element.remove();
  useStacks.setState({ scrollEl: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const swipe = () => fireEvent.wheel(element, { deltaX: -120, deltaY: 0 });

it.each([
  { deltaX: -120, deltaY: 0 },
  { deltaX: 0, deltaY: -120 },
  { deltaX: 5, deltaY: -120 },
  { deltaX: 0, deltaY: -3, deltaMode: 1 },
])("opens Search with outward room scrolling in sheet layout: %j", (delta) => {
  fireEvent.wheel(element, delta);
  expect(openUniversalSearch).toHaveBeenCalledTimes(1);
  fireEvent.wheel(element, delta);
  expect(openUniversalSearch).toHaveBeenCalledTimes(1);
});

it("requires a new gesture after arriving at About", () => {
  element.scrollLeft = 120;
  swipe();
  element.scrollLeft = 0;
  swipe();
  expect(openUniversalSearch).not.toHaveBeenCalled();
  act(() => void vi.advanceTimersByTime(200));
  swipe();
  expect(openUniversalSearch).toHaveBeenCalledTimes(1);
});

it.each(["deltaX", "deltaY"] as const)(
  "opens Search on another %s swipe before arrival momentum ends",
  (axis) => {
    element.scrollLeft = 120;
    fireEvent.wheel(element, { [axis]: -120 });
    element.scrollLeft = 0;
    for (const distance of [24, 8, 2, 1]) {
      act(() => void vi.advanceTimersByTime(16));
      fireEvent.wheel(element, { [axis]: -distance });
    }
    expect(openUniversalSearch).not.toHaveBeenCalled();
    for (const distance of [4, 16, 40, 80]) {
      act(() => void vi.advanceTimersByTime(16));
      fireEvent.wheel(element, { [axis]: -distance });
    }
    expect(openUniversalSearch).toHaveBeenCalledTimes(1);
    expect(element.scrollLeft).toBe(0);
  },
);

it("rotates the camera past the left edge while Search opens", () => {
  const opening = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: -120,
  });
  fireEvent(element, opening);
  expect(openUniversalSearch).toHaveBeenCalledTimes(1);
  expect(opening.defaultPrevented).toBe(true);
  expect(element.scrollLeft).toBe(0);
  act(() => void vi.advanceTimersByTime(120));
  const camera = new PerspectiveCamera();
  applyRoomEdgeCameraRotation(camera);
  expect(camera.position.x).toBe(0);
  expect(camera.rotation.y).toBeGreaterThan(0);
});

it.each([{ deltaX: 120 }, { deltaY: 120 }])(
  "resists the right edge past the CD without opening Search: %j",
  (delta) => {
    useStacks.setState({ activeUnit: 6 });
    element.scrollLeft = 2340;
    fireEvent.wheel(element, delta);
    expect(element.scrollLeft).toBe(2340);
    act(() => void vi.advanceTimersByTime(120));
    const camera = new PerspectiveCamera();
    camera.position.x = 26.4;
    applyRoomEdgeCameraRotation(camera);
    expect(camera.position.x).toBe(26.4);
    expect(camera.rotation.y).toBeLessThan(0);
    expect(openUniversalSearch).not.toHaveBeenCalled();
    expect(useStacks.getState().activeUnit).toBe(6);
    act(() => void vi.advanceTimersByTime(2000));
    expect(roomEdgeMotion.getOffset()).toBe(0);
  },
);

it("keeps a horizontal trackpad gesture and its diagonal tail on native scrolling", () => {
  useStacks.setState({ activeUnit: 1 });
  element.scrollLeft = 400;
  for (const delta of [
    { deltaX: -40, deltaY: 2 },
    { deltaX: -1, deltaY: 2 },
  ]) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ...delta,
    });
    fireEvent(element, event);
    expect(event.defaultPrevented).toBe(false);
    // jsdom has no native scrolling. The bridge must not add its own delta.
    expect(element.scrollLeft).toBe(400);
  }
});

it.each(["deltaX", "deltaY"] as const)(
  "accepts repeated %s swipes at the CD without leaving the edge or window",
  (axis) => {
    useStacks.setState({ activeUnit: 6 });
    element.scrollLeft = 2340;
    const wheel = (distance: number, elapsed = 16) => {
      fireEvent.wheel(element, { [axis]: distance });
      act(() => void vi.advanceTimersByTime(elapsed));
    };
    wheel(120, 160);
    wheel(6, 200);
    wheel(1);
    const before = Math.abs(roomEdgeMotion.getOffset());
    wheel(30);
    wheel(60, 32);
    expect(Math.abs(roomEdgeMotion.getOffset())).toBeGreaterThan(before);
    act(() => void vi.advanceTimersByTime(1600));
    expect(roomEdgeMotion.getSnapshot().active).toBe(false);
    wheel(120, 120);
    expect(roomEdgeMotion.getOffset()).toBeLessThan(-0.05);
    expect(element.scrollLeft).toBe(2340);
    expect(useStacks.getState().activeUnit).toBe(6);
    expect(openUniversalSearch).not.toHaveBeenCalled();
  },
);

it("leaves zoom, other shelves, and desktop dock layout alone", () => {
  fireEvent.wheel(element, { deltaX: -120, ctrlKey: true });
  fireEvent.wheel(element, { deltaY: -120, ctrlKey: true });
  act(() => void vi.advanceTimersByTime(200));
  useStacks.setState({ activeUnit: 1 });
  swipe();
  act(() => void vi.advanceTimersByTime(200));
  useStacks.setState({ activeUnit: 0 });
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: false,
  } as MediaQueryList);
  swipe();
  expect(openUniversalSearch).not.toHaveBeenCalled();
});
