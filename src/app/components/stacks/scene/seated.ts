/**
 * Seated state — the "sit down in the chair" mechanic.
 *
 * Shared contract between three owners that must not import each other:
 *   - UnitAbout / SitChair  writes  `requestSeat` / `leaveSeat`
 *   - CameraRig             writes  `setSeatAmount` every frame while it eases
 *   - SceneEnvironment      reads   `getSeatAmount()` to cross-fade the DC skyline
 *
 * Deliberately dependency-free (no React, no three) so any of the three can
 * import it without pulling the others into its chunk.
 */

export type SeatPose = {
  /** World-space eye position when seated. */
  eye: [number, number, number];
  /** World-space point the seated camera looks at (behind the shelf line). */
  target: [number, number, number];
};

/**
 * Where sitting in the About seat puts you.
 *
 * MEASURED, not guessed, and re-measured whenever the seat changes — which is
 * the whole point of the note that follows. These numbers were originally
 * taken off eames-chair.glb. When the owner swapped that for a couch, every
 * one of them silently became wrong: the camera still worked, it just sat
 * 0.57 units off the couch's centre line and behind its front face, looking
 * out of the upholstery. A hard-coded pose cannot warn you about that, so it
 * has to be re-derived rather than nudged.
 *
 * Current occupant, translated from the measured live hull after the couch
 * moved from local z +0.08 to −0.30 inside Unit 0's +0.10 yaw. The local
 * −0.38 z shift becomes world (−0.0379 x, −0.3781 z):
 *
 *   couch.glb   x −4.0115…−1.6602   y −1.1150…+0.2602   z −1.0008…+0.9669
 *               centre x −2.8359, ground y −1.115, front face z +0.9669
 *
 * eye.x is the seat's centre line.
 *
 * eye.y +0.02 puts the eye 1.135 above the floor: natural for a low couch,
 * but ten centimetres higher than the previous pose so the last part of the
 * transition never grazes the upholstery.
 *
 * eye.z is deliberately just past the seat's own FRONT FACE rather than at its
 * centre: the model's facing is not something the camera can know, and an eye
 * inside the hull would be looking into upholstery from whichever side the
 * backrest turned out to be on. You never see the thing you are sitting in, so
 * the cheap, safe placement is the correct one. 0.13 units of air beyond the
 * measured front face also leaves room for the camera near plane.
 *
 * The target is 6 units straight out, level and a degree up — you are looking
 * away from the shelf, out at the Washington skyline.
 *
 * Owned by UnitAbout / SitChair — CameraRig only consumes it.
 */
export const SEAT_POSE: SeatPose = {
  eye: [-2.836, 0.02, 1.097],
  target: [-2.836, 0.14, 7.097],
};

let seated = false;
/** 0 = fully at the shelf, 1 = fully seated. Driven by CameraRig's easing. */
let amount = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeSeated(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True once the user has clicked the chair, until they leave. */
export function isSeated(): boolean {
  return seated;
}

/** Eased 0..1 written by CameraRig each frame. Read this for visual blends. */
export function getSeatAmount(): number {
  return amount;
}

export function requestSeat() {
  if (seated) return;
  seated = true;
  emit();
}

export function leaveSeat() {
  if (!seated) return;
  seated = false;
  emit();
}

/** Tear down the seat mechanic with no camera tail left behind.
 *
 * `leaveSeat` intentionally preserves `amount` so an ordinary in-world exit
 * can ease back to the shelf. A world/chair unmount has no CameraRig left to
 * perform that ease, so both the intent and transient blend must be cleared
 * synchronously before a later mount reads this module singleton. */
export function resetSeat() {
  const changed = seated || amount !== 0;
  seated = false;
  amount = 0;
  if (changed) emit();
}

export function toggleSeat() {
  seated = !seated;
  emit();
}

/**
 * CameraRig calls this every frame with its eased progress. Does NOT emit —
 * per-frame notification would thrash React. Consumers that need the value
 * read it inside their own useFrame.
 */
export function setSeatAmount(v: number) {
  amount = v < 0 ? 0 : v > 1 ? 1 : v;
}
