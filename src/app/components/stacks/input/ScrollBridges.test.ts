import { describe, expect, it } from "vitest";

import {
  blocksWorldTouchTravel,
  isStacksScrollableTarget,
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
});
