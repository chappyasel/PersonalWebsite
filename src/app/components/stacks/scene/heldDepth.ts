export type HeldDepthBounds = Readonly<{ min: number; max: number }>;

/** Keep a carried prop in front of the camera while still giving the wheel
 * enough range to feel useful. The far allowance is deliberately modest:
 * shelf physics resolves nearby obstacles, but an authored fallback should
 * not be able to bury a prop deep inside the room. */
export function heldDepthBounds(initialDepth: number): HeldDepthBounds {
  const depth = Math.max(0.1, initialDepth);
  return {
    min: Math.min(depth, Math.max(0.9, depth * 0.28)),
    max: depth + 1.4,
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
