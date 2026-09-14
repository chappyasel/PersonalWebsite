// @vitest-environment jsdom
import { sideLensPlan } from "../scene/lensGeometry";
import { useStacks } from "../store";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useDesktopDetailsBoundary } from "./useDesktopDetailsBoundary";

function Dock({ hidden = false }: { hidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const modalOpen = useStacks((state) => state.modalOpen);
  useDesktopDetailsBoundary(ref, hidden);
  return (
    <div ref={ref} data-dock>
      <div
        data-stacks-desktop-panel
        data-stacks-active={!modalOpen || undefined}
      >
        <div className="placard-scroll" style={{ paddingLeft: 32 }} />
      </div>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(868, 0, 400, 800),
  );
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(868);
});
afterEach(() => {
  cleanup();
  useStacks.setState(useStacks.getInitialState());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the sky's blur framing fixed when a modal hides and returns the dock", () => {
  render(<Dock />);
  const lens = () =>
    sideLensPlan({
      viewportWidth: 1440,
      navRightPx: 180,
      detailsLeftPx: useStacks.getState().desktopDetailsLeftPx,
      seated: false,
      captureCenter: null,
    });
  const before = lens();
  expect(before.line.start[0]).toBe(0.375);
  act(() => useStacks.getState().setModalOpen(true));
  expect(lens()).toEqual(before);
  act(() => useStacks.getState().setBookModalReturning(true));
  expect(lens()).toEqual(before);
  act(() => useStacks.getState().setModalOpen(false));
  expect(lens()).toEqual(before);
});

it("still changes framing when the visitor explicitly hides the sidebar", () => {
  const view = render(<Dock />);
  expect(useStacks.getState().desktopDetailsLeftPx).toBe(900);
  view.rerender(<Dock hidden />);
  expect(useStacks.getState().desktopDetailsLeftPx).toBeNull();
});

it("ignores sidebar translation when resizing under a modal", () => {
  render(<Dock />);
  act(() => useStacks.getState().setModalOpen(true));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(1400, 0, 400, 800),
  );
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(useStacks.getState().desktopDetailsLeftPx).toBe(900);
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(968);
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(useStacks.getState().desktopDetailsLeftPx).toBe(1000);
});
