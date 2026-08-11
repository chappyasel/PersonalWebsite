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
 * Current occupant, read out of the live scene via
 * `window.__stacks.bbox("stacks-seat")` (the group SitChair wraps around
 * whatever it is holding):
 *
 *   couch.glb   x −3.6725…−1.5950   y −1.1150…+0.2602   z −0.4084…+1.1781
 *               centre x −2.634, ground y −1.115, front face z +1.178
 *
 * eye.x is the seat's centre line.
 *
 * eye.y −0.08 puts the eye 1.035 above the floor, which at the FLOOR scale the
 * seat and the clock share (~0.96 units per metre) is a seated eye height of
 * about 1.08 m — right for a low couch, against the 1.37 m the standing travel
 * camera implies.
 *
 * eye.z is deliberately just past the seat's own FRONT FACE rather than at its
 * centre: the model's facing is not something the camera can know, and an eye
 * inside the hull would be looking into upholstery from whichever side the
 * backrest turned out to be on. You never see the thing you are sitting in, so
 * the cheap, safe placement is the correct one. The couch is 0.405 deeper than
 * the chair was, which is why this moved from 0.80 to 1.20.
 *
 * The target is 6 units straight out, level and a degree up — you are looking
 * away from the shelf, out at the Washington skyline.
 *
 * Owned by UnitAbout / SitChair — CameraRig only consumes it.
 */
export const SEAT_POSE: SeatPose = {
  eye: [-2.634, -0.08, 1.2],
  target: [-2.634, 0.02, 7.2],
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
