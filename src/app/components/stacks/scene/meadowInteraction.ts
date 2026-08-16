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
