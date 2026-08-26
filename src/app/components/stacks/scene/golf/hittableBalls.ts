import type * as THREE from "three";

/** A loose ball the golf club may strike.
 *
 * The four authored golf balls live inside GolfExperience's own solver. The
 * basketball, baseball and tennis balls are Grabbables in the shared rigid
 * body world. This registry is the seam between the two: a Grabbable with a
 * `hittable` radius registers itself here, the bay reads positions off it
 * every frame to decide which balls are teed up, and a tap on the ball is
 * routed back to the bay through `tapHittableBall`. Neither side imports the
 * other's component. */
export type HittableBall = {
  key: string;
  unitIndex: number;
  /** World units. The carrier origin is the ball's bottom. */
  radius: number;
  /** Height above the carrier origin where the club should meet the prop.
   * This is the radius for a ball and half the height for an upright can. */
  contactHeight: number;
  massKg: number;
  /** World position of the ball's bottom. */
  bottom: (out: THREE.Vector3) => THREE.Vector3;
  /** Resting, or rolled to a stop, and not in a hand. */
  still: () => boolean;
  /** World-space launch velocity. Fire and forget: the solver may still be
   * loading, in which case the strike lands once it is up. */
  strike: (worldVelocity: THREE.Vector3) => void;
  /** A golf ball. Struck, it is not kicked through the rigid body world but
   * handed to the bay's own ball solver: the prop hides at its home while a
   * ghost flies the authored shot to the green, and shows again when the
   * ghost resets. That keeps the cup, the flagstick and the winner cadence. */
  golf?: boolean;
  hide: () => void;
  show: () => void;
};

export function hittableContactPoint(
  bottom: Readonly<{ x: number; y: number; z: number }>,
  contactHeight: number,
) {
  return { x: bottom.x, y: bottom.y + contactHeight, z: bottom.z };
}

const balls = new Map<string, HittableBall>();
const bays = new Map<number, (key: string) => boolean>();

export function registerHittableBall(ball: HittableBall) {
  balls.set(ball.key, ball);
  return () => {
    if (balls.get(ball.key) === ball) balls.delete(ball.key);
  };
}

export function hittableBallsFor(unitIndex: number): HittableBall[] {
  const out: HittableBall[] = [];
  for (const ball of balls.values())
    if (ball.unitIndex === unitIndex) out.push(ball);
  return out;
}

/** The bay of a unit claims taps on that unit's balls. The handler returns
 * whether it queued a strike, so a ball on the shelf keeps its ordinary tap
 * behaviour. */
export function setHittableBallTapHandler(
  unitIndex: number,
  handler: (key: string) => boolean,
) {
  bays.set(unitIndex, handler);
  return () => {
    if (bays.get(unitIndex) === handler) bays.delete(unitIndex);
  };
}

export function tapHittableBall(key: string): boolean {
  const ball = balls.get(key);
  if (!ball) return false;
  return bays.get(ball.unitIndex)?.(key) ?? false;
}

/** Whether a registered ball answers to this key. Input dispatchers use this
 * to treat a bare hittable Grabbable as tappable even though it registers no
 * activation — its tap belongs to the bay, not the interaction registry. */
export function isHittableBall(key: string): boolean {
  return balls.has(key);
}

/** Test seam. */
export function resetHittableBalls() {
  balls.clear();
  bays.clear();
}
