import { describe, expect, it } from "vitest";

import {
  backgroundWorldGesture,
  blocksWorldTouchTravel,
  isBrowserZoomWheel,
  isInteractiveWorldNavigationTarget,
  isStacksScrollableTarget,
  shouldHandleWorldNavigationKey,
  shouldMirrorWorldHistory,
  worldNavigationStep,
  worldPanDirection,
} from "./ScrollBridges";

describe("ScrollBridges interaction ownership", () => {
  it("suppresses history during Unit Map preview", () => {
    expect(
      shouldMirrorWorldHistory({
        modalOpen: false,
        panelState: "closed",
        unitMapPreview: 3,
      }),
    ).toBe(false);
    expect(
      shouldMirrorWorldHistory({
        modalOpen: false,
        panelState: "closed",
        unitMapPreview: null,
      }),
    ).toBe(true);
  });
  it("does not translate a touch while a prop owns the drag", () => {
    expect(
      blocksWorldTouchTravel({
        dragging: "grab:books:featured-cover",
        modalOpen: false,
        panelState: "closed",
      }),
    ).toBe(true);
    expect(
      blocksWorldTouchTravel({
        dragging: null,
        modalOpen: false,
        panelState: "closed",
      }),
    ).toBe(false);
  });

  it("leaves PageUp/PageDown with an opted-in scrollable card", () => {
    const scrollableChild = {
      closest: (selector: string) =>
        selector.includes("[data-stacks-scrollable]") ? {} : null,
    } as unknown as EventTarget;

    expect(isStacksScrollableTarget(scrollableChild)).toBe(true);
    expect(isStacksScrollableTarget({} as EventTarget)).toBe(false);
  });

  it("maps vertical arrows to the same unit steps as horizontal arrows", () => {
    expect(worldNavigationStep("ArrowRight")).toBe(1);
    expect(worldNavigationStep("ArrowDown")).toBe(1);
    expect(worldNavigationStep("ArrowLeft")).toBe(-1);
    expect(worldNavigationStep("ArrowUp")).toBe(-1);
    expect(worldNavigationStep("Enter")).toBeNull();
  });

  it("maps A/D to continuous horizontal panning without changing arrow jumps", () => {
    expect(worldPanDirection("a")).toBe(-1);
    expect(worldPanDirection("A")).toBe(-1);
    expect(worldPanDirection("d")).toBe(1);
    expect(worldPanDirection("D")).toBe(1);
    expect(worldPanDirection("ArrowRight")).toBeNull();
    expect(worldNavigationStep("a")).toBeNull();
    expect(worldNavigationStep("d")).toBeNull();
  });

  it("leaves browser zoom gestures and focused controls alone", () => {
    expect(isBrowserZoomWheel({ ctrlKey: true })).toBe(true);
    expect(isBrowserZoomWheel({ ctrlKey: false })).toBe(false);

    const button = {
      closest: (selector: string) =>
        selector.includes("button") ? ({} as Element) : null,
    } as unknown as EventTarget;
    expect(isInteractiveWorldNavigationTarget(button)).toBe(true);
    expect(isInteractiveWorldNavigationTarget(null)).toBe(false);
    expect(
      shouldHandleWorldNavigationKey({
        defaultPrevented: true,
        target: null,
      }),
    ).toBe(false);
    expect(
      shouldHandleWorldNavigationKey({
        defaultPrevented: false,
        target: button,
      }),
    ).toBe(false);
  });

  it("collapses an expanded sheet and preserves outside world travel", () => {
    expect(
      backgroundWorldGesture(
        { dragging: null, modalOpen: false, panelState: "open" },
        false,
      ),
    ).toBe("collapse-and-travel");
    expect(
      backgroundWorldGesture(
        { dragging: null, modalOpen: false, panelState: "closing" },
        false,
      ),
    ).toBe("travel");
  });

  it("keeps gestures inside the sheet and modal/prop gestures isolated", () => {
    const mobileChild = {
      closest: (selector: string) =>
        selector.includes("[data-stacks-mobile-panel]") ? {} : null,
    } as unknown as EventTarget;
    expect(isStacksScrollableTarget(mobileChild)).toBe(true);
    expect(
      backgroundWorldGesture(
        { dragging: null, modalOpen: false, panelState: "open" },
        true,
      ),
    ).toBe("blocked");
    expect(
      backgroundWorldGesture(
        { dragging: null, modalOpen: true, panelState: "closed" },
        false,
      ),
    ).toBe("blocked");
    expect(
      backgroundWorldGesture(
        { dragging: "grab:barbell", modalOpen: false, panelState: "closed" },
        false,
      ),
    ).toBe("blocked");
  });
});
