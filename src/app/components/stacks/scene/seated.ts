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
 * Where sitting in the About armchair puts you. Measured against the live
 * chair rather than guessed: eames-chair.glb at its authored pose occupies
 * world x −2.4914…−1.6239, y −1.1150…−0.2246, z −0.1189…+0.7730, so its
 * centre line is x −2.06 and the ground is y −1.115.
 *
 * eye.y −0.08 puts the eye 1.035 above the floor, which at the FLOOR scale the
 * chair and the clock share (~0.99 units per metre) is a seated eye height of
 * 1.04 m — right for a low lounge chair, against the 1.37 m the standing
 * travel camera implies.
 *
 * eye.z 0.80 is deliberately just past the chair's own front face (0.773)
 * rather than at its centre: the model's facing is not something the camera
 * can know, and an eye inside the hull would be looking into upholstery from
 * whichever side the backrest turned out to be on. You never see the chair you
 * are sitting in, so the cheap, safe placement is the correct one.
 *
 * The target is 6 units out on the far side, level and a degree up — you are
 * looking away from the shelf, out at the Washington skyline.
 *
 * Owned by UnitAbout / SitChair — CameraRig only consumes it.
 */
export const SEAT_POSE: SeatPose = {
  eye: [-2.06, -0.08, 0.8],
  target: [-2.06, 0.02, 6.8],
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
