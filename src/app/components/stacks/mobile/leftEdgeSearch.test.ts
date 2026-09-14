// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listenForLeftEdgeSearch } from "./leftEdgeSearch";

let cleanup: () => void;
let allowed: boolean;
const open = vi.fn();

function touch(type: string, x: number, y: number, at: number, fingers = 1) {
  const point = { identifier: 1, clientX: x, clientY: y };
  const contacts = Array.from({ length: fingers }, (_, i) => ({
    ...point,
    identifier: i + 1,
  }));
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    timeStamp: { value: at },
    touches: { value: type === "touchend" ? [] : contacts },
    changedTouches: { value: [point] },
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
}

beforeEach(() => {
  allowed = true;
  open.mockClear();
  cleanup = listenForLeftEdgeSearch({
    target: window,
    canStart: () => allowed,
    canFinish: () => allowed,
    openSearch: open,
    viewportWidth: () => 390,
  });
});
afterEach(() => cleanup());

describe("left-edge search swipe", () => {
  it("opens once after a forceful outward swipe, including native pointer cancellation", () => {
    touch("touchstart", 80, 200, 10);
    window.dispatchEvent(new Event("pointercancel"));
    touch("touchmove", 220, 204, 150);
    expect(open).not.toHaveBeenCalled();
    touch("touchend", 240, 205, 210);
    expect(open).toHaveBeenCalledTimes(1);
    touch("touchend", 240, 205, 215);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([
    [110, 200, 150], // Small adjustment toward the seat.
    [240, 200, 600], // Slow drag.
    [240, 200, 310], // Long but not forceful.
    [20, 200, 150], // Inward swipe.
    [240, 290, 150], // Diagonal/vertical gesture.
  ])("leaves ordinary travel alone: %s, %s at %s", (x, y, at) => {
    touch("touchstart", 80, 200, 10);
    touch("touchmove", x, y, at);
    touch("touchend", x, y, at + 10);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not claim a swipe that merely arrives at the left edge", () => {
    allowed = false;
    touch("touchstart", 80, 200, 10);
    allowed = true;
    touch("touchend", 260, 200, 200);
    expect(open).not.toHaveBeenCalled();
  });

  it("cancels if an interaction or overlay takes over", () => {
    touch("touchstart", 80, 200, 10);
    allowed = false;
    touch("touchmove", 200, 200, 100);
    allowed = true;
    touch("touchend", 260, 200, 200);
    expect(open).not.toHaveBeenCalled();
  });

  it.each(["touchcancel", "blur"])("cancels on %s", (event) => {
    touch("touchstart", 80, 200, 10);
    window.dispatchEvent(new Event(event));
    touch("touchend", 260, 200, 200);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not claim pinch, browser-back, or reversed swipes", () => {
    touch("touchstart", 80, 200, 10);
    touch("touchstart", 90, 200, 20, 2);
    touch("touchend", 260, 200, 200);
    touch("touchstart", 10, 200, 300);
    touch("touchend", 220, 200, 450);
    touch("touchstart", 80, 200, 500);
    touch("touchmove", 230, 200, 600);
    touch("touchmove", 195, 200, 620);
    touch("touchend", 260, 200, 680);
    expect(open).not.toHaveBeenCalled();
  });
});
