import { describe, expect, it } from "vitest";

import { pointerOutLeavesInteraction } from "./hoverOwnership";

describe("3D hover ownership", () => {
  it("ignores a child pointer-out while another surface of the prop is hit", () => {
    const prop = {};

    expect(pointerOutLeavesInteraction(prop, [{ eventObject: prop }])).toBe(
      false,
    );
  });

  it("releases hover after the pointer leaves the entire prop", () => {
    const prop = {};
    const otherProp = {};

    expect(pointerOutLeavesInteraction(prop, [])).toBe(true);
    expect(
      pointerOutLeavesInteraction(prop, [{ eventObject: otherProp }]),
    ).toBe(true);
  });
});
