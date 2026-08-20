import { describe, expect, it } from "vitest";

import { type TouchGestureState, reduceTouchGesture } from "./gesture";

const press = (wasFocused = false, movable = true, activatable = true) =>
  reduceTouchGesture(
    { phase: "idle" },
    {
      type: "press",
      interactionId: "prop",
      pointerId: 1,
      x: 100,
      y: 100,
      at: 0,
      wasFocused,
      movable,
      activatable,
    },
  );

describe("touch gesture arbitration", () => {
  it("focuses on first quick release and activates on the second", () => {
    const first = press();
    expect(first.effects).toEqual([
      { type: "compress", interactionId: "prop" },
    ]);
    expect(
      reduceTouchGesture(first.state, { type: "release", pointerId: 1 })
        .effects,
    ).toEqual([{ type: "focus", interactionId: "prop" }]);
    const second = press(true);
    expect(
      reduceTouchGesture(second.state, { type: "release", pointerId: 1 })
        .effects,
    ).toEqual([{ type: "activate", interactionId: "prop" }]);
  });

  it("transfers full horizontal displacement and cancels vertical motion", () => {
    const initial = press().state;
    const swipe = reduceTouchGesture(initial, {
      type: "move",
      pointerId: 1,
      x: 70,
      y: 104,
      at: 30,
    });
    expect(swipe.state.phase).toBe("swiping");
    expect(swipe.effects).toEqual([
      { type: "swipe-start", interactionId: "prop", displacementX: -30 },
    ]);
    const vertical = reduceTouchGesture(initial, {
      type: "move",
      pointerId: 1,
      x: 103,
      y: 120,
      at: 30,
    });
    expect(vertical.state.phase).toBe("cancelled");
    expect(vertical.effects[0]?.type).toBe("cancel");
  });

  it("promotes a stationary movable press to carrying and never activates cancellation", () => {
    const initial = press(false, true, true).state;
    const pickup = reduceTouchGesture(initial, {
      type: "pickup",
      pointerId: 1,
    });
    expect(pickup.state.phase).toBe("carrying");
    expect(pickup.effects[0]?.type).toBe("pickup");
    const cancelled = reduceTouchGesture(pickup.state, {
      type: "cancel",
      pointerId: 1,
    });
    expect(cancelled.state).toEqual({
      phase: "idle",
    } satisfies TouchGestureState);
    expect(cancelled.effects).toEqual([
      { type: "cancel", interactionId: "prop" },
    ]);
  });
});
