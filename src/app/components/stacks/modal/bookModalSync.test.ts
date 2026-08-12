import { afterEach, describe, expect, it } from "vitest";

import { useStacks } from "../store";
import { jumpToUnitWhenReady } from "./bookModalSync";

describe("book modal world synchronization", () => {
  afterEach(() => {
    const state = useStacks.getState();
    state.setJumpTo(null);
    state.setActiveUnit(0);
  });

  it("detaches before jumpTo writes back to the same store", () => {
    const state = useStacks.getState();
    state.setJumpTo(null);
    let calls = 0;

    jumpToUnitWhenReady(useStacks, 1);
    state.setJumpTo((unit) => {
      calls += 1;
      useStacks.getState().setActiveUnit(unit);
    });

    expect(calls).toBe(1);
    expect(useStacks.getState().activeUnit).toBe(1);
  });

  it("performs one jump per request across repeated modal/hash cycles", () => {
    const state = useStacks.getState();
    let calls = 0;
    state.setJumpTo((unit) => {
      calls += 1;
      useStacks.getState().setActiveUnit(unit);
    });

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const cleanup = jumpToUnitWhenReady(useStacks, 1);
      cleanup();
    }

    expect(calls).toBe(100);
  });
});
