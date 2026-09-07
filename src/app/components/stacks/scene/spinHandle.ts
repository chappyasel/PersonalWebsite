// A hand on a SpinProp.
//
// SpinProp turns its prop on its own (a drift, a hover rate, a lap per
// click). Up close, the globe is turned by dragging it, and for that the
// prop needs a way to be told "follow this hand exactly, then let go with
// this much speed". This is that handle: a mutable record the drag writes
// and SpinProp reads once per frame, never through React state.

export type SpinHandleState = {
  /** While held the prop follows `pending` 1:1 and its own drift pauses. */
  held: boolean;
  /** Radians queued since the last frame. SpinProp drains it. */
  pending: number;
  /** Radians per second left over after a release, bleeding off. */
  velocity: number;
  /** The prop is being looked at up close: no drift, no hover rate. */
  calm: boolean;
};

export type SpinHandle = Readonly<{
  state: SpinHandleState;
  turn(radians: number): void;
  setHeld(held: boolean): void;
  fling(radiansPerSecond: number): void;
  setCalm(calm: boolean): void;
}>;

export function createSpinHandle(): SpinHandle {
  const state: SpinHandleState = {
    held: false,
    pending: 0,
    velocity: 0,
    calm: false,
  };
  return {
    state,
    turn(radians) {
      if (Number.isFinite(radians)) state.pending += radians;
    },
    setHeld(held) {
      state.held = held;
      if (held) state.velocity = 0;
    },
    fling(radiansPerSecond) {
      state.velocity = Number.isFinite(radiansPerSecond) ? radiansPerSecond : 0;
    },
    setCalm(calm) {
      state.calm = calm;
      if (!calm) {
        state.held = false;
        state.velocity = 0;
      }
    },
  };
}
