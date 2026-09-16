// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { registerOverlay } from "~/lib/overlays/coordinator";

import { ImageZoomGestures } from "./ImageZoomGestures";

afterEach(cleanup);

function viewer() {
  const onScale = vi.fn();
  const view = render(
    <div className="PhotoView-Portal" data-testid="viewer">
      <ImageZoomGestures scale={1} onScale={onScale} visible index={0} />
    </div>,
  );
  return { ...view, onScale, surface: view.getByTestId("viewer") };
}

function gesture(surface: HTMLElement, type: string, scale = 1) {
  const event = Object.assign(
    new Event(type, { bubbles: true, cancelable: true }),
    { scale },
  );
  fireEvent(surface, event);
  return event;
}

it("consumes browser pinch zoom and accumulates rapid updates without a React render", () => {
  const { surface, onScale } = viewer();
  const page = vi.fn();
  window.addEventListener("wheel", page);
  try {
    for (let i = 0; i < 2; i++) {
      const event = new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -10,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(surface, event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(onScale).toHaveBeenLastCalledWith(Math.exp(0.1) ** 2);
    expect(page).not.toHaveBeenCalled();
    fireEvent.wheel(surface, { ctrlKey: true, deltaY: 1000 });
    expect(onScale).toHaveBeenLastCalledWith(1);
    fireEvent.wheel(surface, { ctrlKey: true, deltaY: -100 });
    fireEvent.wheel(surface, { ctrlKey: true, deltaY: -100 });
    expect(onScale).toHaveBeenLastCalledWith(3);
  } finally {
    window.removeEventListener("wheel", page);
  }
});

it("uses Safari's cumulative gesture scale once, even if it also sends wheel events", () => {
  const { surface, onScale } = viewer();
  expect(gesture(surface, "gesturestart").defaultPrevented).toBe(true);
  expect(gesture(surface, "gesturechange", 1.5).defaultPrevented).toBe(true);
  expect(onScale).toHaveBeenLastCalledWith(1.5);
  fireEvent.wheel(surface, { ctrlKey: true, deltaY: -20 });
  expect(onScale).toHaveBeenCalledTimes(1);
  gesture(surface, "gesturechange", 2);
  expect(onScale).toHaveBeenLastCalledWith(2);
  gesture(surface, "gestureend");
  gesture(surface, "gesturestart");
  gesture(surface, "gesturechange", 0.5);
  expect(onScale).toHaveBeenLastCalledWith(1);
});

it("leaves touchscreen pinch and ordinary scrolling with their existing handlers", () => {
  const { surface, onScale } = viewer();
  const wheel = new WheelEvent("wheel", {
    deltaY: 20,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(surface, wheel);
  expect(wheel.defaultPrevented).toBe(false);
  fireEvent.touchStart(surface, {
    touches: [{ identifier: 1 }, { identifier: 2 }],
  });
  gesture(surface, "gesturestart");
  expect(gesture(surface, "gesturechange", 2).defaultPrevented).toBe(true);
  expect(onScale).not.toHaveBeenCalled();
});

it("yields to child overlays and removes listeners after unmount", () => {
  const { surface, onScale, unmount } = viewer();
  const child = registerOverlay({
    kind: "command",
    surface: document.createElement("div"),
    dismiss: vi.fn(),
  });
  try {
    const event = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -20,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(surface, event);
    expect(event.defaultPrevented).toBe(false);
    expect(onScale).not.toHaveBeenCalled();
  } finally {
    child.release();
  }
  unmount();
  const event = new WheelEvent("wheel", {
    ctrlKey: true,
    deltaY: -20,
    cancelable: true,
  });
  surface.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

it("caps the viewer's own zoom paths and removes the stage offset while zoomed", () => {
  const onScale = vi.fn();
  const view = render(
    <div className="PhotoView-Portal" data-testid="viewer">
      <ImageZoomGestures scale={5} onScale={onScale} visible index={0} />
    </div>,
  );
  expect(onScale).toHaveBeenCalledWith(3);
  expect(
    view
      .getByTestId("viewer")
      .style.getPropertyValue("--image-stage-zoom-weight"),
  ).toBe("0");
  view.rerender(
    <div className="PhotoView-Portal" data-testid="viewer">
      <ImageZoomGestures scale={1} onScale={onScale} visible index={0} />
    </div>,
  );
  expect(
    view
      .getByTestId("viewer")
      .style.getPropertyValue("--image-stage-zoom-weight"),
  ).toBe("1");
});
