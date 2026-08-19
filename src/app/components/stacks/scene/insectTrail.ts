// The recent path an insect has actually flown, for the dev flight HUD.
//
// This lived inside `Butterflies.tsx`, so it was a butterfly feature by
// accident of where it was written: the moths published `trail: []` and the HUD
// — which skips anything under two points — drew nothing for them. Owner
// review: "I still don't see flight path for moths."
//
// It is a fixed ring buffer sampled on an interval rather than every frame,
// because the point of the overlay is the SHAPE of a route over the last half
// minute. Per-frame samples would cost 60× the memory to draw the same line,
// and a trail that grows without bound is a leak on a page people leave open.
import type { CollisionPoint } from "./insectCollision";

export const INSECT_TRAIL_LENGTH = 120;
/** Seconds between samples. 120 × 0.25 s is half a minute of history. */
export const INSECT_TRAIL_INTERVAL = 0.25;

export type InsectTrail = {
  points: { x: number; y: number; z: number }[];
  write: number;
  filled: boolean;
  sampledAt: number;
};

export function createInsectTrail(): InsectTrail {
  return {
    points: Array.from({ length: INSECT_TRAIL_LENGTH }, () => ({
      x: 0,
      y: 0,
      z: 0,
    })),
    write: 0,
    filled: false,
    sampledAt: -1,
  };
}

/** Roll one position in, if the interval has elapsed. True when it was taken. */
export function recordInsectTrail(
  trail: InsectTrail,
  position: CollisionPoint,
  time: number,
) {
  if (time - trail.sampledAt < INSECT_TRAIL_INTERVAL) return false;
  trail.sampledAt = time;
  const point = trail.points[trail.write]!;
  point.x = position.x;
  point.y = position.y;
  point.z = position.z;
  trail.write = (trail.write + 1) % INSECT_TRAIL_LENGTH;
  if (trail.write === 0) trail.filled = true;
  return true;
}

/**
 * Forget everything recorded so far.
 *
 * Needed whenever an insect's position changes by something other than flying —
 * a re-homed butterfly, a moth whose lamp was picked up and put down elsewhere.
 * Without it the overlay draws a stroke across the room that never happened.
 */
export function clearInsectTrail(trail: InsectTrail) {
  trail.write = 0;
  trail.filled = false;
  trail.sampledAt = -1;
}

/** Oldest first, which is the order a line wants. */
export function insectTrailPoints(trail: InsectTrail) {
  const count = trail.filled ? INSECT_TRAIL_LENGTH : trail.write;
  const points: { x: number; y: number; z: number }[] = [];
  for (let offset = 0; offset < count; offset++) {
    const index = trail.filled
      ? (trail.write + offset) % INSECT_TRAIL_LENGTH
      : offset;
    const point = trail.points[index]!;
    points.push({ x: point.x, y: point.y, z: point.z });
  }
  return points;
}
