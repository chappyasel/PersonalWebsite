// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GLOBE_DRAG_RADIANS_PER_PX,
  beginGlobeDrag,
  cancelGlobeDrag,
  globeSpin,
  globeTilt,
} from "./globeCloseUpState";

vi.mock("../room/roomEvents", () => ({
  roomWindowEvents: {
    addEventListener: (...args: Parameters<Window["addEventListener"]>) =>
      window.addEventListener(...args),
    removeEventListener: (...args: Parameters<Window["removeEventListener"]>) =>
      window.removeEventListener(...args),
  },
}));
vi.mock("../fieldNotes/progress", () => ({ recordFieldNoteEvent: vi.fn() }));

function pointer(type: string, pointerId: number, clientX = 0, clientY = 0) {
  window.dispatchEvent(
    Object.assign(new Event(type), { pointerId, clientX, clientY }),
  );
}

beforeEach(() => {
  globeSpin.state.velocity = 0;
  globeSpin.setCalm(true);
  globeTilt.current = 0;
});
afterEach(() => {
  cancelGlobeDrag();
  globeSpin.setCalm(false);
});

describe("globe drag ownership", () => {
  it("uses the threshold event as the origin and ignores other pointers", () => {
    beginGlobeDrag(7, { clientX: 100, clientY: 100 });
    pointer("pointermove", 8, 500, 500);
    pointer("pointerup", 8);
    expect(globeSpin.state.held).toBe(true);
    expect(globeSpin.state.pending).toBe(0);
    pointer("pointermove", 7, 110, 100);
    expect(globeSpin.state.pending).toBeCloseTo(10 * GLOBE_DRAG_RADIANS_PER_PX);
    expect(globeTilt.current).toBe(0);
    globeSpin.step(1 / 60, 0);
    const speed = globeSpin.state.velocity;
    pointer("pointerup", 7);
    expect(globeSpin.state.held).toBe(false);
    expect(globeSpin.state.velocity).toBe(speed);
  });

  it.each(["pointercancel", "blur"])(
    "stops and removes listeners on %s",
    (type) => {
      beginGlobeDrag(1, { clientX: 0, clientY: 0 });
      pointer("pointermove", 1, 40);
      globeSpin.step(1 / 60, 0);
      pointer(type, 1);
      expect(globeSpin.state.held).toBe(false);
      expect(globeSpin.state.velocity).toBe(0);
      pointer("pointermove", 1, 80);
      expect(globeSpin.state.pending).toBe(0);
    },
  );

  it("replaces an unfinished gesture without duplicate listeners", () => {
    beginGlobeDrag(1, { clientX: 0, clientY: 0 });
    beginGlobeDrag(2, { clientX: 100, clientY: 0 });
    pointer("pointermove", 1, 1000);
    pointer("pointermove", 2, 110);
    expect(globeSpin.state.pending).toBeCloseTo(10 * GLOBE_DRAG_RADIANS_PER_PX);
    cancelGlobeDrag();
    pointer("pointermove", 2, 120);
    expect(globeSpin.state.pending).toBe(0);
  });
});
