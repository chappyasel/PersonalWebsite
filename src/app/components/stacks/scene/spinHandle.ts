// The globe's angular velocity lives here across hover, dragging and release.
// Pointer samples apply force; only the frame step advances the visible angle.

export type SpinHandleState = {
  held: boolean;
  /** Drag input queued since the last frame, in radians. */
  pending: number;
  /** Current angular velocity, in radians per second. */
  velocity: number;
  /** Up close, hand momentum settles before the slow ambient drift resumes. */
  calm: boolean;
  /** Keep a hovered map mark still enough to read and click. */
  paused: boolean;
};

const HAND_GAIN = 3;
const HELD_DRAG = 4;
const COAST_DRAG = 1.8;
export const SPIN_MAX_HAND_SPEED = 2.5;

export type SpinHandle = Readonly<{
  state: SpinHandleState;
  turn(radians: number): void;
  setHeld(held: boolean): void;
  setCalm(calm: boolean): void;
  /** Advance motion and return the angle to add this frame. */
  step(seconds: number, ambientRate: number): number;
}>;

export function createSpinHandle(
  onHandTurn?: (radians: number) => void,
): SpinHandle {
  const state: SpinHandleState = {
    held: false,
    pending: 0,
    velocity: 0,
    calm: false,
    paused: false,
  };
  let handDriven = false;
  return {
    state,
    turn(radians) {
      if (Number.isFinite(radians)) state.pending += radians;
    },
    setHeld(held) {
      state.held = held;
      if (held) handDriven = true;
    },
    setCalm(calm) {
      state.calm = calm;
      if (!calm) {
        state.held = false;
        state.pending = 0;
        state.paused = false;
        handDriven = false;
      }
    },
    step(seconds, ambientRate) {
      if (!Number.isFinite(seconds) || seconds <= 0) return 0;
      // Ignore time spent suspended, while retaining ordinary 30/60/120 Hz timing.
      const dt = Math.min(seconds, 1 / 15);
      const drag = state.held ? HELD_DRAG : state.calm ? COAST_DRAG : 1.4;
      const inputRate = (state.pending * HAND_GAIN) / (dt * drag);
      state.pending = 0;
      const manual = state.held || state.calm;
      const target =
        state.held || state.paused || (state.calm && handDriven)
          ? inputRate
          : ambientRate;
      // Exact integration of a constant force with drag. Cap actual speed,
      // not input force: coalesced pointer samples must retain their weight.
      const decay = Math.exp(-drag * dt);
      const nextVelocity = target + (state.velocity - target) * decay;
      let turn = target * dt + ((state.velocity - target) * (1 - decay)) / drag;
      if (manual && Math.abs(nextVelocity) > SPIN_MAX_HAND_SPEED) {
        const limit = Math.sign(nextVelocity) * SPIN_MAX_HAND_SPEED;
        const timeToLimit = Math.max(
          0,
          -Math.log((limit - target) / (state.velocity - target)) / drag,
        );
        turn =
          target * timeToLimit +
          ((state.velocity - target) * (1 - Math.exp(-drag * timeToLimit))) /
            drag +
          limit * (dt - timeToLimit);
        state.velocity = limit;
      } else state.velocity = nextVelocity;
      if (handDriven && state.calm && turn !== 0) onHandTurn?.(turn);
      // Stop crediting hand motion before natural drift takes over. Waiting
      // for the coast also avoids reversing a leftward flick prematurely.
      if (!state.held && handDriven && Math.abs(state.velocity) < 0.02)
        handDriven = false;
      return turn;
    },
  };
}
