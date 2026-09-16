import { createRoomEdgeMotion } from "../mobile/roomEdgeMotion";

/** A separate impulse keeps home feedback independent of edge and Search pans.
 * The shared spring cancels on navigation, blur, and reduced motion, and runs
 * no animation frames at rest. Repeated taps restart rather than accumulate. */
export const homeTapMotion = createRoomEdgeMotion();

/** The spring peaks near 0.074, giving a roughly 2.2% pullback. */
export function homeTapPullback(offset: number) {
  return Math.max(0, Math.min(0.025, offset * 0.3));
}
