/**
 * Who owns the room's scroll container during a coarse travel gesture, and
 * what makes them stop owning it.
 *
 * A finger's travel is not over when the browser first says so. `scrollend`
 * fires at the end of the touch-driven phase while the browser's own momentum
 * is still delivering scrolls, so a gesture that releases ownership there
 * leaves the rest of the motion to nobody: the bounds clamp is gated on
 * ownership, and the room coasts past the stop it was just snapped to.
 *
 * The first attempt at this compared two settle positions for equality. That
 * cannot work, because the clamp itself pins the position — two consecutive
 * ends observe the same clamped value and equality certifies a quiet that
 * never happened. Quiet has to be proved from scroll ACTIVITY and elapsed
 * time, and the container's own corrective writes must not count as activity.
 *
 * Ownership also has to end the instant something else takes the destination.
 * An armed clamp bounds every write, including one the visitor explicitly
 * asked for: with a gesture still armed from Books, choosing Talks writes
 * 2340 and the next scroll clamps it back to Systems at 1220.87. So takeover
 * is a synchronous notification checked BEFORE the clamp, not a flag read
 * later at settle time — by then the palette may have closed again and the
 * only evidence is gone.
 */

/** How long the container must be genuinely still before a gesture settles.
 *
 * Measured, not guessed, and the first value here was too small: the largest
 * gap between consecutive scroll events during a real backward fling on a
 * 390px viewport was 42ms (settle-proof, Books native fling, three repeats at
 * 33/42/42ms), and the first post-clamp event in the falsify matrix arrived
 * ~41.6ms after its predecessor. A 34ms window sits UNDER both, so it would
 * release ownership in the gap and hand the tail of the motion to nobody —
 * the exact defect this is here to prevent.
 *
 * 100ms is a CHOSEN POLICY above a 42ms observation, not a guarantee against
 * every browser or stalled frame. It is a floor on stillness measured from the
 * last real motion — redundant ends and our own correction echoes must not
 * push the deadline out, or a settle can land arbitrarily late. */
export const COARSE_TRAVEL_QUIET_MS = 100;

export type CoarseTravelOwner = {
  /** The contact that owns this travel. A predecessor's pointerup must not
   * release its successor. */
  pointerId: number;
  /** Monotonic per-gesture id, so a stale timer can be told from a live one. */
  generation: number;
};

export type CoarseTravelSettleDecision = "revoke" | "wait" | "settle";

export function coarseTravelSettleDecision({
  owner,
  takenOver,
  blocked,
  lastScrollAt,
  now,
  quietMs = COARSE_TRAVEL_QUIET_MS,
}: {
  owner: CoarseTravelOwner | null;
  /** Something else claimed the destination since this gesture began. */
  takenOver: boolean;
  /** A surface owns the room right now (drag, modal, panel, ride, palette). */
  blocked: boolean;
  /** When the container last moved on its own, excluding our corrections. */
  lastScrollAt: number | null;
  now: number;
  quietMs?: number;
}): CoarseTravelSettleDecision {
  if (!owner) return "revoke";
  if (takenOver || blocked) return "revoke";
  // No scroll has ever been attributed to this gesture: a contact that armed
  // travel and then never moved the container. There is nothing to settle and
  // nothing to wait for, and re-arming here is how a lone touchstart, or a
  // scrollend with no scroll behind it, turns into a timer that reschedules
  // itself forever. Give the gesture up instead.
  if (lastScrollAt === null) return "revoke";
  return now - lastScrollAt >= quietMs ? "settle" : "wait";
}

/** Whether an event belongs to the gesture that currently owns travel. */
export function ownsCoarseTravel(
  owner: CoarseTravelOwner | null,
  pointerId: number,
) {
  return owner !== null && owner.pointerId === pointerId;
}

/** Whether a scheduled callback is still the live gesture's. */
export function isCurrentGeneration(
  owner: CoarseTravelOwner | null,
  generation: number,
) {
  return owner !== null && owner.generation === generation;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Announce that something other than a coarse gesture now owns where the room
 * goes — a rail link, a keyboard jump, a popstate, a chosen search result.
 *
 * Deliberately synchronous: the scroll write that follows an explicit
 * navigation is the very next thing to happen, and a clamp that is still armed
 * when it lands will drag the visitor back inside the old gesture's window.
 *
 * The settle's own `travelTo` must NOT call this. That call is the gesture
 * finishing its own work, not a takeover, and revoking there would make a
 * gesture cancel itself.
 */
export function notifyRoomTakeover() {
  for (const listener of listeners) listener();
}

export function onRoomTakeover(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
