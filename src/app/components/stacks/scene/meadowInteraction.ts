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
 * Settle a RELEASED brush strength onto exactly zero once it is invisible.
 *
 * `target` is the strength the frame loop is currently damping toward, and it
 * is the whole reason this takes two arguments. A settle that looked only at
 * the eased value would also eat the attack ramp: each damp step is a
 * fraction of the target, so a slow drag — `meadowDragSample` scales
 * `hoverStrength` by `1 - exp(-speed / dragSpeedScale)`, which is a few
 * percent for a gentle sweep — would be knocked back to zero every frame and
 * could never climb past the epsilon. The flowers fail this first: they ease
 * at less than a third of the grass attack rate, so their first steps are
 * smaller still. Anything a gesture is actively driving therefore passes
 * through untouched, however small.
 *
 * With no gesture driving it the brush contributes at most `strength` to a
 * lean the shader clamps at `MEADOW_WIND.authoredMaxLean` (0.36) and
 * multiplies by a sway height under 0.35 world units, so collapsing it at the
 * epsilon moves a blade tip by at most a third of a millimetre — under a
 * thousandth of a pixel from the traverse camera. What it buys is a uniform
 * that is genuinely zero at rest.
 */
export function meadowSettledBrushStrength(
  strength: number,
  target: number,
): number {
  if (target > 0) return strength;
  return strength < MEADOW_BRUSH_IDLE_EPSILON ? 0 : strength;
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
