import { useStacks } from "../store";
import { afterEach, describe, expect, it } from "vitest";

import {
  type PropReactionInteractionState,
  propReactionIsEngaged,
  setPropReactionsSuppressed,
} from "./reactionEngagement";

const idle: PropReactionInteractionState = {
  hovered: null,
  focusedInteraction: null,
  pressedInteraction: null,
  dragging: null,
};

afterEach(() => {
  setPropReactionsSuppressed(false);
  useStacks.getState().setHovered(null);
});

describe("prop reaction engagement", () => {
  it("uses fine-pointer hover", () => {
    expect(propReactionIsEngaged({ ...idle, hovered: "prop" }, "prop")).toBe(
      true,
    );
  });

  it("uses persistent Touch Focus", () => {
    expect(
      propReactionIsEngaged({ ...idle, focusedInteraction: "prop" }, "prop"),
    ).toBe(true);
  });

  it("keeps a new press in the compression cue", () => {
    expect(
      propReactionIsEngaged({ ...idle, pressedInteraction: "prop" }, "prop"),
    ).toBe(false);
  });

  it("keeps the held reaction during a focused prop's second press", () => {
    expect(
      propReactionIsEngaged(
        {
          ...idle,
          focusedInteraction: "prop",
          pressedInteraction: "prop",
        },
        "prop",
      ),
    ).toBe(true);
  });

  it("hands a carried prop fully to the carry and physics paths", () => {
    expect(
      propReactionIsEngaged(
        {
          ...idle,
          hovered: "prop",
          focusedInteraction: "prop",
          dragging: "prop",
        },
        "prop",
      ),
    ).toBe(false);
  });

  it("ignores state owned by another prop", () => {
    expect(
      propReactionIsEngaged(
        {
          ...idle,
          hovered: "other",
          focusedInteraction: "other",
        },
        "prop",
      ),
    ).toBe(false);
  });

  it("suppresses hover reactions and new hover claims during free roam", () => {
    setPropReactionsSuppressed(true);
    expect(propReactionIsEngaged({ ...idle, hovered: "prop" }, "prop")).toBe(
      false,
    );

    useStacks.getState().setHovered("prop");
    expect(useStacks.getState().hovered).toBeNull();
  });
});
