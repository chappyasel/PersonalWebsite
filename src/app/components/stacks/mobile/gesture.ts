/** A finger rarely lands and lifts on the same CSS pixel. Keep small contact
 * drift a tap while still handing deliberate motion to travel. */
export const TOUCH_SLOP_PX = 16;
export const TOUCH_HORIZONTAL_DOMINANCE = 1.15;
export const TOUCH_PICKUP_MS = 350;

export type TouchGestureState =
  | { phase: "idle" }
  | {
      phase: "pressing";
      interactionId: string;
      pointerId: number;
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      startedAt: number;
      wasFocused: boolean;
      movable: boolean;
      activatable: boolean;
      activateOnFirstTouch: boolean;
      dragIntent: boolean;
    }
  | {
      phase: "swiping";
      pointerId: number;
      startX: number;
      lastX: number;
      lastAt: number;
      velocityX: number;
    }
  | {
      phase: "carrying";
      interactionId: string;
      pointerId: number;
    }
  /** The prop owns the rest of this contact through its own drag intent
   * (the near globe turning); the arbiter only waits for the pointer to lift. */
  | { phase: "handed-off"; pointerId: number }
  | { phase: "cancelled"; pointerId: number };

export type TouchGestureEvent =
  | {
      type: "press";
      interactionId: string;
      pointerId: number;
      x: number;
      y: number;
      at: number;
      wasFocused: boolean;
      movable: boolean;
      activatable: boolean;
      activateOnFirstTouch: boolean;
      /** An anchored prop that answers a drag itself. Movement past the tap
       * slop in either axis hands the contact to it instead of the World. */
      dragIntent: boolean;
    }
  | { type: "move"; pointerId: number; x: number; y: number; at: number }
  | { type: "pickup"; pointerId: number }
  | { type: "release"; pointerId: number }
  | { type: "cancel"; pointerId: number };

export type TouchGestureEffect =
  | { type: "compress"; interactionId: string }
  | { type: "drag-intent"; interactionId: string }
  | { type: "swipe-start"; interactionId: string; displacementX: number }
  | { type: "swipe-move"; deltaX: number; velocityX: number }
  | { type: "pickup"; interactionId: string }
  | { type: "carry-move"; interactionId: string; x: number; y: number }
  | { type: "focus"; interactionId: string }
  | { type: "activate"; interactionId: string }
  | { type: "carry-release"; interactionId: string }
  | { type: "clear-focus"; interactionId: string }
  | { type: "swipe-release"; velocityX: number; displacementX: number }
  | { type: "cancel"; interactionId?: string };

export type TouchGestureReduction = {
  state: TouchGestureState;
  effects: TouchGestureEffect[];
};

/** Pure gesture arbitration. The first horizontal sample transfers the full
 * displacement so the World never jumps behind the finger. */
export function reduceTouchGesture(
  state: TouchGestureState,
  event: TouchGestureEvent,
): TouchGestureReduction {
  if (event.type === "press") {
    return {
      state: {
        phase: "pressing",
        interactionId: event.interactionId,
        pointerId: event.pointerId,
        startX: event.x,
        startY: event.y,
        lastX: event.x,
        lastY: event.y,
        startedAt: event.at,
        wasFocused: event.wasFocused,
        movable: event.movable,
        activatable: event.activatable,
        activateOnFirstTouch: event.activateOnFirstTouch,
        dragIntent: event.dragIntent,
      },
      effects: [{ type: "compress", interactionId: event.interactionId }],
    };
  }
  if (state.phase === "idle" || event.pointerId !== state.pointerId)
    return { state, effects: [] };
  if (event.type === "cancel") {
    const interactionId =
      state.phase === "pressing" || state.phase === "carrying"
        ? state.interactionId
        : undefined;
    const effects: TouchGestureEffect[] = [{ type: "cancel", interactionId }];
    if (state.phase === "carrying")
      effects.push({ type: "clear-focus", interactionId: state.interactionId });
    return {
      state: { phase: "idle" },
      effects,
    };
  }
  if (event.type === "pickup") {
    if (state.phase !== "pressing" || !state.movable)
      return { state, effects: [] };
    return {
      state: {
        phase: "carrying",
        interactionId: state.interactionId,
        pointerId: state.pointerId,
      },
      effects: [{ type: "pickup", interactionId: state.interactionId }],
    };
  }
  if (event.type === "move") {
    if (state.phase === "carrying")
      return {
        state,
        effects: [
          {
            type: "carry-move",
            interactionId: state.interactionId,
            x: event.x,
            y: event.y,
          },
        ],
      };
    if (state.phase === "cancelled" || state.phase === "handed-off")
      return { state, effects: [] };
    if (state.phase === "swiping") {
      const dt = Math.max(1, event.at - state.lastAt);
      const deltaX = event.x - state.lastX;
      const velocityX = deltaX / dt;
      return {
        state: { ...state, lastX: event.x, lastAt: event.at, velocityX },
        effects: [{ type: "swipe-move", deltaX, velocityX }],
      };
    }
    const dx = event.x - state.startX;
    const dy = event.y - state.startY;
    if (Math.hypot(dx, dy) <= TOUCH_SLOP_PX)
      return {
        state: { ...state, lastX: event.x, lastY: event.y },
        effects: [],
      };
    // The prop answers this drag itself, in either axis: a globe turns
    // sideways and tilts up and down. Neither World travel nor a cancel
    // runs; the contact is the prop's until it lifts.
    if (state.dragIntent) {
      return {
        state: { phase: "handed-off", pointerId: state.pointerId },
        effects: [{ type: "drag-intent", interactionId: state.interactionId }],
      };
    }
    if (Math.abs(dx) > Math.abs(dy) * TOUCH_HORIZONTAL_DOMINANCE) {
      return {
        state: {
          phase: "swiping",
          pointerId: state.pointerId,
          startX: state.startX,
          lastX: event.x,
          lastAt: event.at,
          velocityX: dx / Math.max(1, event.at - state.startedAt),
        },
        effects: [
          {
            type: "swipe-start",
            interactionId: state.interactionId,
            displacementX: dx,
          },
        ],
      };
    }
    if (Math.abs(dy) > Math.abs(dx)) {
      return {
        state: { phase: "cancelled", pointerId: state.pointerId },
        effects: [{ type: "cancel", interactionId: state.interactionId }],
      };
    }
    return { state, effects: [] };
  }
  if (event.type === "release") {
    if (state.phase === "pressing") {
      const effect: TouchGestureEffect =
        state.activatable && (state.activateOnFirstTouch || state.wasFocused)
          ? { type: "activate", interactionId: state.interactionId }
          : { type: "focus", interactionId: state.interactionId };
      return { state: { phase: "idle" }, effects: [effect] };
    }
    if (state.phase === "carrying")
      return {
        state: { phase: "idle" },
        effects: [
          { type: "carry-release", interactionId: state.interactionId },
          { type: "clear-focus", interactionId: state.interactionId },
        ],
      };
    if (state.phase === "swiping")
      return {
        state: { phase: "idle" },
        effects: [
          {
            type: "swipe-release",
            velocityX: state.velocityX,
            displacementX: state.lastX - state.startX,
          },
        ],
      };
    return { state: { phase: "idle" }, effects: [] };
  }
  return { state, effects: [] };
}
