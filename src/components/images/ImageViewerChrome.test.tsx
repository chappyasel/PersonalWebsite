// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ImageViewerChrome } from "./ImageViewerChrome";

let resize: () => void;
let captionHeight: number;
beforeEach(() => {
  captionHeight = 80;
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute("data-artifact-preview-caption")
        ? captionHeight
        : 124;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the caption outside the bottom dock and the action before pagination", () => {
  const onIndexChange = vi.fn();
  const onMeasure = vi.fn();
  const view = render(
    <ImageViewerChrome
      title="Object title"
      caption="The caption."
      captionId="caption-object"
      contentTop={500}
      captionMaxHeight={100}
      onMeasure={onMeasure}
      actions={[{ href: "/example", label: "Read more" }]}
      total={3}
      index={1}
      visible
      onIndexChange={onIndexChange}
      onClose={vi.fn()}
    />,
  );
  const dock = view.container.querySelector("[data-artifact-preview-scrim]")!;
  expect(dock.querySelector("[data-artifact-preview-caption]")).toBeNull();
  expect(view.queryByRole("heading")).toBeNull();
  const action = view.getByRole("link", { name: "Read more" });
  const next = view.getByRole("button", { name: "Next image" });
  expect(
    action.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(next);
  expect(onIndexChange).toHaveBeenCalledWith(2);
  expect(onMeasure).toHaveBeenLastCalledWith({
    captionHeight: 80,
    controlsHeight: 124,
  });
  captionHeight = 160;
  act(() => resize());
  expect(onMeasure).toHaveBeenLastCalledWith({
    captionHeight: 160,
    controlsHeight: 124,
  });
});

it("keeps a touch scroll inside the caption away from the viewer's window listener", () => {
  const view = render(
    <ImageViewerChrome
      caption="A caption long enough to scroll."
      captionId="caption-scroll"
      contentTop={400}
      captionMaxHeight={60}
      total={1}
      index={0}
      visible
      onIndexChange={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const windowTouchMove = vi.fn();
  window.addEventListener("touchmove", windowTouchMove);
  const caption = view.container.querySelector(
    "[data-artifact-preview-caption]",
  )!;
  fireEvent.touchMove(caption);
  fireEvent.touchMove(
    view.container.querySelector("[data-artifact-preview-scrim]")!,
  );
  window.removeEventListener("touchmove", windowTouchMove);
  expect(windowTouchMove).toHaveBeenCalledTimes(1);
});
