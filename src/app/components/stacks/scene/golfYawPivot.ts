// The pointer yaw at the tee.
//
// On a shelf stop the pointer yaw orbits the eye around the look point, so
// the shelf holds and the room behind it sweeps: the subject is the shelf.
// At the tee the subject is the green, twenty-odd units down the fairway,
// and the same orbit did the wrong thing there: the aisle point held, the
// tee barely moved, and the green swept seven degrees across the frame with
// every pointer run, dragging the target around under the visitor's aim.
//
// So in golf mode the whole rig, eye and aim together, rotates about the
// cup's vertical axis instead. The green is pinned exactly where it was;
// everything nearer slides, and the nearer it is the more it slides (a
// point at distance d shifts by about yaw × (D/d − 1) for a pivot at D),
// so the club, the balls and the shelf edges carry the head turn that the
// green no longer does.
//
// Direction matters more than anything here. The pan on a shelf stop sends
// the room LEFT when the pointer goes right, and a visitor reaching for a
// ball with the pointer expects the bay to do the same. The first cut
// turned the view right about the cup, which sent the bay right, chasing
// the pointer away from the balls. So for a rightward run the eye steps to
// +x and the view turns left about the cup: the bay, the club and the shelf
// edges slide left as they always did, the green holds, and only the far
// sky drifts the other way by the small angle the camera really turned.
// Pure and three-free; CameraRig blends its result in by the same eased
// weight the depth of field uses to rack onto the cup.

/** How far the eye steps sideways at full pointer run, in world units.
 * Written as travel rather than degrees because a pivot this far away
 * turns very little for a lot of travel: 0.6 units is about 1.5° about the
 * cup and moves the tee by about six degrees, comparable to the sweep a
 * shelf stop's background gets. */
export const GOLF_YAW_EYE_TRAVEL = 0.6;

export type GolfYawRig = {
  eyeX: number;
  eyeZ: number;
  lookX: number;
  lookZ: number;
};

/**
 * Rotate eye and aim rigidly about the pivot in the ground plane. Positive
 * `run` (pointer right of centre) carries the eye toward +x and turns the
 * view left about the pivot, so everything nearer than the pivot slides
 * left, the way the shelf pan slides it, and the pivot itself holds.
 */
export function golfYawRig({
  eyeX,
  eyeZ,
  lookX,
  lookZ,
  pivotX,
  pivotZ,
  run,
  eyeTravel = GOLF_YAW_EYE_TRAVEL,
}: {
  eyeX: number;
  eyeZ: number;
  lookX: number;
  lookZ: number;
  pivotX: number;
  pivotZ: number;
  /** −1..1, the pointer's run to either side of its neutral. */
  run: number;
  eyeTravel?: number;
}): GolfYawRig {
  const dx = eyeX - pivotX;
  const dz = eyeZ - pivotZ;
  const radius = Math.hypot(dx, dz);
  const finiteRun = Number.isFinite(run) ? Math.min(1, Math.max(-1, run)) : 0;
  if (radius < 1e-6 || finiteRun === 0) return { eyeX, eyeZ, lookX, lookZ };
  // Chord, not arc: the travel is what the eye actually covers.
  const yaw =
    -2 * Math.asin(Math.min(1, (finiteRun * eyeTravel) / (2 * radius)));
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const lx = lookX - pivotX;
  const lz = lookZ - pivotZ;
  return {
    eyeX: pivotX + dx * cos - dz * sin,
    eyeZ: pivotZ + dx * sin + dz * cos,
    lookX: pivotX + lx * cos - lz * sin,
    lookZ: pivotZ + lx * sin + lz * cos,
  };
}
