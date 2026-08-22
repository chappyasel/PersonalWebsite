import type * as THREE from "three";

import { HOVER_MOTION_SCALE } from "./Lift";

/**
 * BAND ONE OF ADR 0020 — what a planted thing does when you point at it.
 *
 * A plant is not a small rigid object standing on a plank, and the shared nod
 * treated it as one. Three things separate this from `TIP`:
 *
 *  1. THE SHAPE OF THE GESTURE. The nod is one rotation. A plant leans toward
 *     you AND turns slightly as it does, which is what makes it read as a
 *     living thing rather than a hinged board. Both channels ride ONE spring,
 *     so they arrive, overshoot and settle as a single motion rather than as
 *     two effects that happen to fire at the same time.
 *  2. THE CURVE. `THREE.MathUtils.damp` is a pure exponential: it approaches
 *     and never passes. Leaves overshoot. A plant that eases into a lean the
 *     way a book does reads as the stiff plastic prop several of these models
 *     are already fighting, so this rides an underdamped spring instead.
 *  3. THE PIVOT SURVIVES THE SIZE GATE. `hingeFor` refuses anything over
 *     TILT_MAX_SIZE as furniture, which would silence the monstera and the
 *     large plants — the props whose foliage moves most. Foliage already won
 *     the archetype, so size does not get to veto it a second time; sway asks
 *     for the same pivot with the cutoff lifted.
 *
 * ON LEANING FORWARD. An earlier revision leaned sideways, on the strength of
 * the ambient draught's comment in eggs.tsx that "a plant nodding toward the
 * viewer reads as a bug". That comment is about CONTINUOUS IDLE motion, where
 * a plant bobbing at the camera forever really does look broken. A directed
 * response held only while you point at something is the opposite case, and on
 * the live scene the sideways version read as the plant turning AWAY rather
 * than answering. Owner call, 2026-08-20: forward lean, plus a slight turn.
 *
 * WHAT THIS DELIBERATELY IS NOT: a bend. Foliage really bends from the soil
 * line, and both routes to that were rejected. A vertex shader would have to
 * inject into a material several plants share with the mugs and clocks (see
 * `atlasMaterial` and `userData.shared` in ModelProp), so bending one plant
 * would bend half the shelf. Splitting the foliage into its
 * own node is possible (`articulateDeskLampHead` does exactly that shape of
 * thing) but bails on any multi-mesh GLB and takes the prop off ModelProp's
 * hover floor. Leaning the whole plant about the edge it rests on is what the
 * rest of the world already does, and needs no geometry or material surgery.
 */

/**
 * Peak forward lean in radians, and the slight turn that rides with it.
 *
 * Both are stated as a base times `HOVER_MOTION_SCALE`, the same form TIP
 * uses, because the scene has ONE legibility dial and a band that ignores it
 * is a band that stops responding when someone turns the world up. Band one
 * originally hardcoded these and that is exactly what went wrong: raising the
 * dial moved the books and left the plants where they were.
 *
 * The lean is about three quarters of the shared nod and still travels
 * further, because a plant is taller than the handheld props TIP was measured
 * on and the two pivot the same way, about the edge the prop rests on. The
 * turn is deliberately small enough to be felt rather than read: it lands near
 * 4 degrees, about what a plant's crown shifts when someone brushes past it.
 */
export const SWAY_LEAN = 0.066 * HOVER_MOTION_SCALE;
export const SWAY_TWIST = 0.029 * HOVER_MOTION_SCALE;

/**
 * Spring constants, as (stiffness, damping) for unit mass.
 *
 * Damping ratio is 20 / (2 * sqrt(300)) = 0.577, which passes the target once
 * by ~11% and is settled inside ~0.7s. Both numbers are chosen against the
 * shared nod rather than in a vacuum: LIFT_LAMBDA reaches ~95% of its travel
 * in 300ms, so a plant that took several seconds to stop swinging would read
 * as a different scene rather than a different material. One visible bounce, a
 * fraction slower than everything else, is the whole effect.
 */
export const SWAY_STIFFNESS = 300;
export const SWAY_DAMPING = 20;

/**
 * Fixed integration step, and the cap on how much time one frame may advance.
 *
 * A spring integrated with the raw frame delta runs at a different speed on a
 * different monitor, which this scene has already been bitten by: hover easing
 * tuned on a 60Hz panel ran at double rate on a 120Hz one. Substepping at a
 * fixed 1/240 makes the curve identical on both. The 1/30 cap is the same one
 * the rest of the scene applies to `delta`, so a long GC pause cannot fling a
 * plant across the shelf.
 */
export const SWAY_STEP = 1 / 240;
export const SWAY_MAX_DELTA = 1 / 30;
/** 1/30 of travel at a 1/240 step needs 8. Twelve is the runaway backstop. */
const SWAY_MAX_STEPS = 12;

/**
 * Settle thresholds, in ENGAGEMENT units rather than radians.
 *
 * The spring drives an unitless 0-to-1 value that BOTH rotation channels
 * scale, which is what keeps the lean and the turn one gesture. So the
 * threshold is relative: 1e-3 of the lean is well inside Lift's absolute 1e-4
 * at any dial setting. Velocity has to be tested too, or a spring passing
 * through its target at full speed would be mistaken for a settled one and
 * frozen mid-swing.
 */
const SWAY_SETTLE_VALUE = 1e-3;
const SWAY_SETTLE_VELOCITY = 1e-3;

export type SwaySpring = { angle: number; velocity: number };

export function createSwaySpring(): SwaySpring {
  return { angle: 0, velocity: 0 };
}

/**
 * Advance one spring toward `target` by `delta` seconds.
 *
 * Stiffness and damping are per-BAND since 2026-08-20: the plants' spring was
 * the only one in the world and it read better than the exponential everything
 * else used, so every band rides one now. They differ because bounce is a
 * material property — paper overshoots, iron does not.
 *
 * `target` is an engagement value, normally 1 while the pointer rests on the
 * prop and 0 once it leaves, NOT an angle. The caller multiplies the settled
 * value by each channel's own peak, so a single overshoot carries the lean and
 * the turn together.
 *
 * Returns true once the spring has SETTLED, meaning it has both reached the
 * target and stopped moving, at which point it is snapped exactly onto the
 * target so the caller's own settle test can idle the prop. Returning false
 * means "still integrating, call me again next frame".
 */
export function stepSway(
  spring: SwaySpring,
  target: number,
  delta: number,
  stiffness: number = SWAY_STIFFNESS,
  damping: number = SWAY_DAMPING,
): boolean {
  // Already settled and still asked for the same target: there are nine
  // plants in the world and this runs for each of them every frame, so the
  // idle case must cost a comparison rather than eight substeps. Exact
  // equality is safe because settling SNAPS onto the target below.
  if (spring.angle === target && spring.velocity === 0) return true;
  let remaining = Math.min(Math.max(delta, 0), SWAY_MAX_DELTA);
  for (let step = 0; remaining > 1e-9 && step < SWAY_MAX_STEPS; step += 1) {
    const dt = Math.min(SWAY_STEP, remaining);
    // Semi-implicit Euler: velocity first, then position from the NEW
    // velocity. Explicit Euler adds energy to a spring, and this one would
    // slowly wind itself up over a long hover.
    const acceleration =
      (target - spring.angle) * stiffness - spring.velocity * damping;
    spring.velocity += acceleration * dt;
    spring.angle += spring.velocity * dt;
    remaining -= dt;
  }
  if (
    Math.abs(spring.angle - target) < SWAY_SETTLE_VALUE &&
    Math.abs(spring.velocity) < SWAY_SETTLE_VELOCITY
  ) {
    spring.angle = target;
    spring.velocity = 0;
    return true;
  }
  return false;
}

/**
 * Which way a plant turns as it leans, given where the camera is.
 *
 * The forward lean itself reuses `cameraSideHoverTilt`, the same solver the
 * shared nod uses, so a plant and a book agree about which way "toward the
 * viewer" is and both lean by their full authored angle rather than by however
 * high the camera happens to sit. Only the turn needs its own sign, and it
 * cannot come from a scene-wide constant for the same reason the lean's
 * cannot: the camera sits on different sides of a prop in top-shelf,
 * lower-shelf and portrait compositions. Turning toward the camera's side is
 * what makes the gesture read as the plant orienting on you rather than
 * twisting at random.
 */
export function cameraSideSwayTwist(
  cameraDirection: Pick<THREE.Vector3, "x">,
  angle: number,
): number {
  if (angle <= 0) return 0;
  return cameraDirection.x > 0 ? angle : -angle;
}
