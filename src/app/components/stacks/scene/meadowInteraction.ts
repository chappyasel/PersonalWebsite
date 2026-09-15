import { SHELF_GEOMETRY } from "./shelfGeometry";
import { TRAVEL_X, UNIT_SPACING, unitPose } from "./worldLayout";

/** The floor scene runs at roughly 0.96 world units per metre, so 0.6 world
 * units is just under two feet. The pointer response fades across this apron
 * behind each shelf instead of continuing through the distant meadow. */
export const MEADOW_POKE_FADE_DEPTH = 0.6;

const SHELF_BACK_Z = Math.min(
  SHELF_GEOMETRY.top.centerZ - SHELF_GEOMETRY.top.depth / 2,
  SHELF_GEOMETRY.lower.centerZ - SHELF_GEOMETRY.lower.depth / 2,
);

export const MEADOW_LAST_UNIT = Math.round(TRAVEL_X / UNIT_SPACING);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function shelfEdgeForUnit(unit: number, worldX: number): number {
  const pose = unitPose(clamp(unit, 0, MEADOW_LAST_UNIT));
  const dx = worldX - pose.position[0];
  const yaw = pose.rotation[1];
  return pose.position[2] + (SHELF_BACK_Z - Math.sin(yaw) * dx) / Math.cos(yaw);
}

function shelfBackXBounds(unit: number): [number, number] {
  const pose = unitPose(unit);
  const yaw = pose.rotation[1];
  const centerX = pose.position[0] + Math.sin(yaw) * SHELF_BACK_Z;
  const halfWidth = Math.cos(yaw) * (SHELF_GEOMETRY.width / 2);
  return [centerX - halfWidth, centerX + halfWidth];
}

/** Continuous world-z line behind the shelf row. It follows each shelf's
 * actual rotated back edge and smoothly bridges the open gaps between units. */
export function shelfBackEdgeAt(worldX: number): number {
  const firstBounds = shelfBackXBounds(0);
  if (worldX <= firstBounds[1]) return shelfEdgeForUnit(0, worldX);

  for (let unit = 0; unit < MEADOW_LAST_UNIT; unit += 1) {
    const [, right] = shelfBackXBounds(unit);
    const [nextLeft, nextRight] = shelfBackXBounds(unit + 1);
    if (worldX < nextLeft) {
      const raw = clamp((worldX - right) / (nextLeft - right), 0, 1);
      const blend = raw * raw * (3 - 2 * raw);
      return (
        shelfEdgeForUnit(unit, worldX) * (1 - blend) +
        shelfEdgeForUnit(unit + 1, worldX) * blend
      );
    }
    if (worldX <= nextRight) return shelfEdgeForUnit(unit + 1, worldX);
  }

  return shelfEdgeForUnit(MEADOW_LAST_UNIT, worldX);
}

/** World-z position where the shelf-normal fade reaches zero. */
export function shelfPokeFadeEndAt(worldX: number): number {
  return shelfBackEdgeAt(worldX) - MEADOW_POKE_FADE_DEPTH;
}

/** Shelf-relative strength for the pointer poke: full through the shelf,
 * smooth across the final two-foot apron, and exactly zero in the meadow. */
export function meadowPokeStrength(worldX: number, worldZ: number): number {
  const depthPastShelf = shelfBackEdgeAt(worldX) - worldZ;
  if (depthPastShelf <= 0) return 1;
  if (depthPastShelf >= MEADOW_POKE_FADE_DEPTH) return 0;
  const t = depthPastShelf / MEADOW_POKE_FADE_DEPTH;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Where an eased brush stops existing.
 *
 * `meadowPokeStrength` above already returns an exact zero out in the field;
 * this is the same idea on the time axis. `THREE.MathUtils.damp` approaches
 * its target geometrically, so a brush released toward zero at the authored
 * grass rate loses under 3% per 120Hz frame and stays a denormal for tens of
 * seconds. The grass vertex shader gates its entire pointer/pulse block on
 * `uPoke.w > 0.0`, and that guard is what lets 1.45 million vertex
 * invocations skip work that only ever depends on the tuft origin — so a
 * strength that never reaches zero would make the expensive path the
 * resident one. This is the value at which the frame loop writes an exact
 * zero instead, and it is the same threshold the frame loop already used to
 * decide whether a touch gesture was still animating.
 */
export const MEADOW_BRUSH_IDLE_EPSILON = 0.001;

/**
 * How long a brush has to go undriven before it counts as released.
 *
 * The frame loop's gesture target is per-FRAME: it starts at zero and is only
 * written on frames that carried a pointer sample. A 60Hz mouse under a 120Hz
 * renderer therefore reports a target on every other frame and zero on the
 * rest, and a 240Hz panel reports three zeros for every sample. Those zeros
 * are not a released gesture, and a settle that cannot tell them from one
 * snaps the attack ramp back down between every pair of samples — a slow drag
 * alternates and never accumulates. That is the distinction this window
 * exists to draw: gesture-idle, not between-event.
 *
 * 250ms is fifteen times the gap between samples of a 60Hz pointer, so it has
 * room for a stalled main thread or a throttled device, and it costs nothing:
 * the release decay needs about 1.6 seconds to carry full hover strength down
 * to the epsilon anyway, so waiting out the window never keeps the shader's
 * expensive path alive any longer than the decay already does.
 */
export const MEADOW_BRUSH_IDLE_GRACE_SECONDS = 0.25;

/**
 * Settle a released brush strength onto exactly zero once it is invisible.
 *
 * `meadowPokeStrength` above returns an exact zero out in the field; this is
 * the same idea on the time axis, and `secondsSinceDriven` is what makes it
 * safe. Anything a gesture has touched inside the grace window passes through
 * untouched, however small, so no attack ramp is ever knocked back.
 *
 * With no gesture driving it, collapsing the brush moves the lean in TWO
 * ways, and the second is the larger one. The direct term is
 * `uPokeDir * push`, which is bounded by the epsilon itself. The indirect
 * term is the wind suppression: the shader computes
 * `w * (1 - windSuppression * interactionShape)`, and `interactionShape`
 * carries `clamp(uPoke.w / hoverStrength, 0, 1)`, so an epsilon of brush
 * still holds back `0.82 * (epsilon / 0.2)` of the gust. Against the gust
 * ceiling that is about four times the direct term. Both together move a
 * blade tip by under two millimetres on a lawn the traverse camera views
 * from several world units away — about 1.4% of a full-lean throw, and far
 * below one pixel. `meadowVertexBudget.test.ts` asserts the complete bound
 * rather than the direct half. What it buys is a uniform that is genuinely
 * zero at rest, which is what lets the grass vertex shader skip its whole
 * per-instance interaction block.
 */
export function meadowSettledBrushStrength(
  strength: number,
  secondsSinceDriven: number,
): number {
  if (secondsSinceDriven < MEADOW_BRUSH_IDLE_GRACE_SECONDS) return strength;
  return strength < MEADOW_BRUSH_IDLE_EPSILON ? 0 : strength;
}

/**
 * How long the brush has gone undriven, on a clock that can restart.
 *
 * R3F resets `clock.elapsedTime` when the frameloop changes — `sceneClock.ts`
 * exists to wrap `setFrameloop` and put it back, which is a wrapper and
 * therefore something that can be bypassed. If it ever is, a stamp taken
 * before the reset sits in the future forever, the age goes permanently
 * negative, and the settle silently never arms again: no visual defect, but
 * the shader's expensive path becomes the resident one and nothing says so.
 *
 * A clock that has moved backwards means the frameloop restarted, which means
 * any gesture is long over, so the safe reading is "idle".
 */
export function meadowBrushIdleSeconds(
  now: number,
  lastDrivenAt: number,
): number {
  return now >= lastDrivenAt ? now - lastDrivenAt : Number.POSITIVE_INFINITY;
}

/** Whether no brush and no click ring carries strength. The frame loop
 * publishes the negation as `uPulseActive`, the shader's single uniform gate
 * over the per-instance interaction block. */
export function meadowBrushAtRest(
  brushStrength: number,
  pulseStrengths: readonly number[],
): boolean {
  return (
    brushStrength <= 0 && pulseStrengths.every((strength) => strength <= 0)
  );
}
