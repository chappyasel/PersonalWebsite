import { describe, expect, it } from "vitest";

import { type TouchGestureState, reduceTouchGesture } from "./gesture";

const press = (
  wasFocused = false,
  movable = true,
  activatable = true,
  activateOnFirstTouch = false,
) =>
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
      activateOnFirstTouch,
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

  it("activates a direct touch action on its first quick release", () => {
    const first = press(false, false, true, true);

    expect(
      reduceTouchGesture(first.state, { type: "release", pointerId: 1 })
        .effects,
    ).toEqual([{ type: "activate", interactionId: "prop" }]);
  });

  it("keeps ordinary finger jitter inside a tap", () => {
    const initial = press().state;
    const jittered = reduceTouchGesture(initial, {
      type: "move",
      pointerId: 1,
      x: 104,
      y: 111,
      at: 40,
    });

    expect(jittered.state.phase).toBe("pressing");
    expect(
      reduceTouchGesture(jittered.state, { type: "release", pointerId: 1 })
        .effects,
    ).toEqual([{ type: "focus", interactionId: "prop" }]);
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
      { type: "clear-focus", interactionId: "prop" },
    ]);
  });

  it("re-arms first-tap focus after carrying an actionable prop", () => {
    const initial = press(true, true, true).state;
    const pickup = reduceTouchGesture(initial, {
      type: "pickup",
      pointerId: 1,
    });
    const released = reduceTouchGesture(pickup.state, {
      type: "release",
      pointerId: 1,
    });

    expect(released.effects).toEqual([
      { type: "carry-release", interactionId: "prop" },
      { type: "clear-focus", interactionId: "prop" },
    ]);
  });

  it("leaves a primary carry intact when a secondary finger lifts", () => {
    const initial = press().state;
    const carrying = reduceTouchGesture(initial, {
      type: "pickup",
      pointerId: 1,
    });
    const secondaryRelease = reduceTouchGesture(carrying.state, {
      type: "release",
      pointerId: 2,
    });

    expect(secondaryRelease.state).toBe(carrying.state);
    expect(secondaryRelease.effects).toEqual([]);
  });

  it("retains total travel when releasing a swipe over a prop", () => {
    const initial = press().state;
    const swiping = reduceTouchGesture(initial, {
      type: "move",
      pointerId: 1,
      x: 55,
      y: 102,
      at: 80,
    });

    expect(
      reduceTouchGesture(swiping.state, { type: "release", pointerId: 1 })
        .effects,
    ).toEqual([
      { type: "swipe-release", velocityX: -0.5625, displacementX: -45 },
    ]);
  });
});
