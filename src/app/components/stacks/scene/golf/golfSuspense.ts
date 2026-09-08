// The cup-edge push-in.
//
// A ball rolling up to the hole that might just drop is the one moment on
// the green with real suspense, and the camera can lean into it: the aim
// eases onto the cup and the lens tightens, holds a beat once the ball has
// dropped or died on the lip, then lets go. It is a broadcast move, kept
// small and slow so it reads as attention rather than a cut.
//
// Everything here is pure and three-free. GolfExperience advances the state
// from its physics loop and publishes the aim in world space through the
// transient below; CameraRig reads that imperatively each frame, the way
// the depth of field reads focusPull. Nothing goes through React state.
//
// Gated. Off unless the visit asked for it (`?suspense=1`) or the dev hook
// turned it on (`__stacks.golf.suspense(true)`), so it can be judged in the
// real room before it is on for everyone.
import { GOLF_CUP } from "./golfCourse";
import type { GolfBallId, GolfBallState, GolfVec3 } from "./golfTypes";

export const GOLF_SUSPENSE = {
  /** Horizontal distance from the cup within which a rolling ball counts as
   * "at the hole". Matches the physics' approach-drag radius. */
  radius: 1.5,
  /** This close, a ball counts even while moving away: a lip-out is still
   * the moment, right up until it clearly leaves. */
  lipRadius: GOLF_CUP.radius + 0.22,
  /** Faster than this at the radius is a ball that will hit the lip and go;
   * there is no "might" to lean into. */
  maxSpeed: 2.6,
  /** Slower than this is a ball that has stopped (the physics zeroes it
   * below 0.012). */
  minSpeed: 0.02,
  /** Hold after the ball drops, over the confetti, before letting go. */
  dropHoldSeconds: 0.9,
  /** Hold after the ball dies short, or rolls past, before letting go. */
  missHoldSeconds: 0.45,
  /** Time to full push-in, and back out. Out is slower: the release should
   * feel like a breath, not a snap back. */
  attackSeconds: 1.1,
  releaseSeconds: 1.7,
  /** Fraction of the field of view removed at full push (33° → 22.4°). */
  fovPush: 0.32,
  /** Where the aim lands between the cup (0) and the ball (1) while the
   * ball is still rolling. A little toward the ball keeps both in frame. */
  aimTowardBall: 0.3,
  /** The largest frame delta integrated, so a tab that was hidden comes
   * back easing rather than jumping. */
  maxFrameSeconds: 0.1,
} as const;

/** What CameraRig reads each frame: an eased 0..1 and a world-space aim. */
export const golfSuspense = { weight: 0, x: 0, y: 0, z: 0 };

let enabled = false;
const enabledListeners = new Set<() => void>();

export function golfSuspenseEnabled() {
  return enabled;
}

export function setGolfSuspenseEnabled(next: boolean) {
  if (enabled === next) return;
  enabled = next;
  for (const listener of enabledListeners) listener();
}

/** The Scene console subscribes here so its switch follows the URL gate and
 * the dev hook as well as its own presses. */
export function subscribeGolfSuspenseEnabled(listener: () => void) {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

export function golfSuspenseRequestedBySearch(
  search: string | URLSearchParams,
) {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("suspense") === "1";
}

export type GolfSuspenseState = {
  /** Linear 0..1 in time; `golfSuspenseWeight` eases it. */
  progress: number;
  /** A candidate ball was at the hole last frame. */
  live: boolean;
  /** Seconds left of the hold after a drop or a miss. */
  holdFor: number;
  ballId: GolfBallId | null;
  /** Course-local aim. Kept through the release so the camera eases back
   * from where it was looking, not from a reset point. */
  aim: GolfVec3;
};

export function createGolfSuspenseState(): GolfSuspenseState {
  return {
    progress: 0,
    live: false,
    holdFor: 0,
    ballId: null,
    aim: { x: 0, y: 0, z: 0 },
  };
}

/** The rolling ball, if any, that might drop: at the hole, still moving,
 * slow enough to be in doubt, and heading in (or already on the lip). The
 * nearest wins when two qualify. */
export function golfSuspenseCandidate(
  balls: readonly GolfBallState[],
  cup: GolfVec3,
): GolfBallState | null {
  let best: GolfBallState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const ball of balls) {
    if (ball.phase !== "roll") continue;
    const dx = cup.x - ball.position.x;
    const dz = cup.z - ball.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > GOLF_SUSPENSE.radius) continue;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (speed > GOLF_SUSPENSE.maxSpeed || speed < GOLF_SUSPENSE.minSpeed)
      continue;
    const closing = ball.velocity.x * dx + ball.velocity.z * dz > 0;
    if (!closing && distance > GOLF_SUSPENSE.lipRadius) continue;
    if (distance < bestDistance) {
      best = ball;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One frame of the push-in. `allowed` is the gate, reduced motion and the
 * golf window together; passing false never snaps, it only starts the
 * release from wherever the push got to. Returns the eased weight.
 */
export function advanceGolfSuspense(
  state: GolfSuspenseState,
  balls: readonly GolfBallState[],
  cup: GolfVec3,
  frameSeconds: number,
  allowed = true,
): number {
  const frame = Math.min(
    GOLF_SUSPENSE.maxFrameSeconds,
    Math.max(0, frameSeconds),
  );
  let engaged = false;
  const live = allowed ? golfSuspenseCandidate(balls, cup) : null;
  if (live) {
    engaged = true;
    state.holdFor = 0;
    state.ballId = live.id;
    const toward = GOLF_SUSPENSE.aimTowardBall;
    state.aim.x = cup.x + (live.position.x - cup.x) * toward;
    state.aim.y = cup.y + (live.position.y - cup.y) * toward;
    state.aim.z = cup.z + (live.position.z - cup.z) * toward;
  } else if (!allowed) {
    state.holdFor = 0;
    state.ballId = null;
  } else {
    if (state.live && state.ballId) {
      // The moment resolved this frame. A drop holds on the cup itself,
      // through the confetti; a miss holds a shorter beat where it was.
      const tracked = balls.find((ball) => ball.id === state.ballId);
      if (tracked?.phase === "cup") {
        state.holdFor = GOLF_SUSPENSE.dropHoldSeconds;
        state.aim.x = cup.x;
        state.aim.y = cup.y;
        state.aim.z = cup.z;
      } else if (tracked?.phase === "roll") {
        state.holdFor = GOLF_SUSPENSE.missHoldSeconds;
      } else {
        state.holdFor = 0;
      }
    }
    if (state.holdFor > 0) {
      engaged = true;
      state.holdFor = Math.max(0, state.holdFor - frame);
      if (state.holdFor === 0) state.ballId = null;
    } else {
      state.ballId = null;
    }
  }
  state.live = live !== null;
  state.progress = engaged
    ? Math.min(1, state.progress + frame / GOLF_SUSPENSE.attackSeconds)
    : Math.max(0, state.progress - frame / GOLF_SUSPENSE.releaseSeconds);
  return golfSuspenseWeight(state.progress);
}

/** Ease-in-out over the push, both ways. */
export function golfSuspenseWeight(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}

/** What the camera multiplies its travel field of view by. */
export function golfSuspenseFovScale(weight: number): number {
  return 1 - Math.min(1, Math.max(0, weight)) * GOLF_SUSPENSE.fovPush;
}
