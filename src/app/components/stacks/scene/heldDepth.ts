import type { Vector3 } from "three";

/** A vertical carry plane keeps lifting independent of shelf depth. */
export function heldDragDirection(viewDirection: Vector3, target: Vector3) {
  target.set(viewDirection.x, 0, viewDirection.z);
  if (target.lengthSq() < 1e-8) target.set(0, 0, -1);
  return target.normalize();
}

export type HeldDepthBounds = Readonly<{ min: number; max: number }>;

/** Pull a prop closer and return it to its pickup depth, without letting a
 * wheel or pinch bury it behind its original shelf position. */
export function heldDepthBounds(initialDepth: number): HeldDepthBounds {
  const depth = Math.max(0.1, initialDepth);
  return {
    min: Math.min(depth, Math.max(0.9, depth * 0.28)),
    max: depth,
  };
}

/** WheelEvent deltas may arrive in pixels, text lines, or viewport pages.
 * Convert them before applying a world-space response so a mouse wheel and a
 * trackpad move a held object by comparable amounts. */
export function heldDepthWheelPixels(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
) {
  if (deltaMode === 1) return deltaY * 33;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}

/** Wheel up (negative delta) pulls the prop closer; wheel down pushes it
 * farther away. */
export function nextHeldDepth(
  currentDepth: number,
  wheelPixels: number,
  bounds: HeldDepthBounds,
) {
  return Math.min(
    bounds.max,
    Math.max(bounds.min, currentDepth + wheelPixels * 0.0025),
  );
}

/** Match the physical perspective relationship: doubling the distance
 * between two fingers doubles the apparent scale, so the hold depth halves.
 * A minimum starting span keeps nearly-overlapping contacts from amplifying
 * a few pixels of finger noise into a large jump. */
export function heldDepthFromPinch(
  initialDepth: number,
  initialSpanPx: number,
  spanPx: number,
  bounds: HeldDepthBounds,
) {
  const start = Math.max(24, initialSpanPx);
  const span = Math.max(24, spanPx);
  return Math.min(
    bounds.max,
    Math.max(bounds.min, initialDepth * (start / span)),
  );
}
