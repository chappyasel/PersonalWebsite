import { type GolfFixedStepper, resetGolfBall } from "./golfPhysics";
import type { GolfStrikeQueue } from "./golfStrikeQueue";
import type { GolfBallState } from "./golfTypes";

export const GOLF_CONFETTI_COUNT = 144;

export function golfMotionPolicy(reducedMotion: boolean) {
  return {
    physics: true,
    clubSwing: !reducedMotion,
    glint: !reducedMotion,
    turfPuff: !reducedMotion,
    confetti: !reducedMotion,
    staticCupGlow: reducedMotion,
  } as const;
}

/** The single silent reset used for section departure and unmount. React owns
 * presentation timers, while this pure seam restores every simulation owner. */
export function resetGolfSession(
  balls: GolfBallState[],
  queue: GolfStrikeQueue,
  stepper: GolfFixedStepper,
) {
  queue.cancel();
  stepper.clear();
  for (const ball of balls) resetGolfBall(ball);
}
