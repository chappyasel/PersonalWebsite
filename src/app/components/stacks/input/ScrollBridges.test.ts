import { describe, expect, it } from "vitest";

import {
  backgroundWorldGesture,
  blocksWorldTouchTravel,
  isStacksScrollableTarget,
  worldNavigationStep,
} from "./ScrollBridges";

describe("ScrollBridges interaction ownership", () => {
  it("does not translate a touch while a prop owns the drag", () => {
    expect(
      blocksWorldTouchTravel({
        dragging: "grab:books:secret-spine",
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
        selector === "[data-stacks-scrollable]" ? {} : null,
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
