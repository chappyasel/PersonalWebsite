// @vitest-environment jsdom
import { touchWorldRef } from "../store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GLOBE_DRAG_RADIANS_PER_PX,
  beginGlobeDrag,
  cancelGlobeDrag,
  globeApproach,
  globeChapterHover,
  globeSpin,
  globeTilt,
  tapGlobe,
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

describe("globe chapter taps", () => {
  const chapter = { id: "sf", name: "San Francisco", lat: 37.77, lon: -122.42 };
  const mark = {
    kind: "chapter" as const,
    index: 0,
    chapters: [chapter],
    x: 100,
    y: 100,
  };
  beforeEach(() => {
    globeApproach.set(true);
    globeChapterHover.set(null);
    touchWorldRef.interactionPointerType = "touch";
  });
  afterEach(() => {
    globeApproach.set(false);
    globeChapterHover.set(null);
    touchWorldRef.interactionPointerType = "unknown";
  });
  it("shows the first touched chapter and opens only on its second tap", () => {
    const open = vi.fn();
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    expect(globeChapterHover.current).toEqual(mark);
    expect(open).not.toHaveBeenCalled();
    globeChapterHover.set({ ...mark, x: 102 });
    tapGlobe(open, 0);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0]).toMatchObject({
      href: "https://aicollective.com/chapters/sf",
    });
  });
  it("requires a new first tap after changing marks or turning the globe", () => {
    const open = vi.fn();
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    globeChapterHover.set({
      ...mark,
      index: 1,
      chapters: [{ ...chapter, id: "nyc" }],
    });
    tapGlobe(open, 0);
    expect(open).not.toHaveBeenCalled();
    beginGlobeDrag(1, { clientX: 0, clientY: 0 });
    cancelGlobeDrag();
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    expect(open).not.toHaveBeenCalled();
  });
  it("does not reuse selection after clearing the label or reopening the globe", () => {
    const open = vi.fn();
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    globeChapterHover.set(null);
    globeApproach.set(false);
    tapGlobe(open, 0);
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    expect(open).not.toHaveBeenCalled();
    tapGlobe(open, 0);
    expect(open).toHaveBeenCalledOnce();
  });
  it("opens the chapters map only after confirming a merged mark", () => {
    const open = vi.fn();
    globeChapterHover.set({
      ...mark,
      chapters: [chapter, { ...chapter, id: "bay-area" }],
    });
    tapGlobe(open, 0);
    expect(open).not.toHaveBeenCalled();
    tapGlobe(open, 0);
    expect(open.mock.calls[0]?.[0]).toMatchObject({
      href: "https://aicollective.com/chapters",
    });
  });
  it("keeps mouse chapter clicks immediate", () => {
    const open = vi.fn();
    touchWorldRef.interactionPointerType = "mouse";
    globeChapterHover.set(mark);
    tapGlobe(open, 0);
    expect(open).toHaveBeenCalledOnce();
  });
});
