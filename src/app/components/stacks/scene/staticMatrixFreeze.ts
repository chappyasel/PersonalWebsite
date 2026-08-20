/**
 * Stop paying `updateMatrix` and `multiplyMatrices` for objects that are not
 * moving.
 *
 * WHY. Profiled on a 6x-throttled phone-class main thread, steady state,
 * production build, with effects and content already at their floors:
 *
 *     updateMatrixWorld   7.6 %
 *     multiplyMatrices    6.2 %
 *     updateWorldMatrix   1.2 %
 *
 * About fifteen percent of the main thread, on the one device that needs the
 * help, spent recomputing transforms for a room that does not move. The
 * content axis cannot touch this: it changes triangle counts, which is GPU
 * work, not the object count that drives this traversal.
 *
 * WHY THIS SHAPE. `Object3D.updateMatrixWorld` does two things per node —
 * `updateMatrix()` to compose the local matrix, then a parent multiply. Both
 * are skipped for a node whose `matrixAutoUpdate` is false and whose world
 * matrix is not flagged dirty. Clearing that flag per object is far safer
 * than clearing `scene.matrixWorldAutoUpdate`, which was the version issue #19
 * proposed: the global switch fails silently and globally when one mover is
 * missed, while this fails for exactly one object, visibly.
 *
 * WHY NO ALLOWLIST. An authored list of static objects is a list that goes
 * stale the first time somebody adds a prop. Instead this watches position,
 * quaternion and scale — the inputs animation code writes — and freezes only
 * what has demonstrably held still, thawing the instant one of them changes.
 * A frozen object that starts moving again is therefore self-correcting,
 * which an allowlist is not.
 *
 * Reviewing is itself a traversal, so it must not run every frame. At the
 * default cadence the review costs one nine-float comparison per object every
 * half second, against a compose-and-multiply per object per frame.
 */

/** The subset of `THREE.Object3D` this needs. Structural so the tests do not
 * have to build a renderer to exercise the policy. */
export type FreezableObject = {
  matrixAutoUpdate: boolean;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  updateMatrix: () => void;
};

/** Consecutive reviews an object must hold still before it is frozen. More
 * than one, so a prop paused mid-animation is not mistaken for scenery. */
export const MATRIX_FREEZE_SETTLED_REVIEWS = 3;

/** Reviews are traversals. Twice a second keeps the amortised cost far below
 * what freezing saves, and still reacts within a second and a half. */
export const MATRIX_FREEZE_REVIEW_MS = 500;

type Tracked = {
  /** position xyz, quaternion xyzw, scale xyz. */
  readonly signature: Float64Array;
  settledReviews: number;
  frozen: boolean;
};

export type MatrixFreezeState = {
  tracked: WeakMap<object, Tracked>;
  lastReviewAt: number;
  frozenCount: number;
};

export function createMatrixFreezeState(): MatrixFreezeState {
  return { tracked: new WeakMap(), lastReviewAt: -Infinity, frozenCount: 0 };
}

function writeSignature(target: Float64Array, object: FreezableObject) {
  const { position: p, quaternion: q, scale: s } = object;
  target[0] = p.x;
  target[1] = p.y;
  target[2] = p.z;
  target[3] = q.x;
  target[4] = q.y;
  target[5] = q.z;
  target[6] = q.w;
  target[7] = s.x;
  target[8] = s.y;
  target[9] = s.z;
}

function signatureMatches(signature: Float64Array, object: FreezableObject) {
  const { position: p, quaternion: q, scale: s } = object;
  return (
    signature[0] === p.x &&
    signature[1] === p.y &&
    signature[2] === p.z &&
    signature[3] === q.x &&
    signature[4] === q.y &&
    signature[5] === q.z &&
    signature[6] === q.w &&
    signature[7] === s.x &&
    signature[8] === s.y &&
    signature[9] === s.z
  );
}

export type MatrixFreezeReview = Readonly<{
  reviewed: number;
  froze: number;
  thawed: number;
  frozen: number;
}>;

/** Whether enough time has passed to review again. Kept separate so the
 * caller can decide in a frame callback without allocating. */
export function matrixFreezeDue(state: MatrixFreezeState, now: number) {
  return now - state.lastReviewAt >= MATRIX_FREEZE_REVIEW_MS;
}

/**
 * Freeze what has held still, thaw what has moved.
 *
 * A thawed object gets one explicit `updateMatrix()`, because while it was
 * frozen its local matrix stopped tracking its transform and the renderer
 * would otherwise draw it at the pose it held when it froze until something
 * else marked it dirty.
 */
export function reviewMatrixFreeze(
  objects: Iterable<FreezableObject>,
  state: MatrixFreezeState,
  now: number,
): MatrixFreezeReview {
  state.lastReviewAt = now;
  let reviewed = 0;
  let froze = 0;
  let thawed = 0;

  for (const object of objects) {
    reviewed += 1;
    const existing = state.tracked.get(object);
    if (!existing) {
      const signature = new Float64Array(10);
      writeSignature(signature, object);
      state.tracked.set(object, {
        signature,
        settledReviews: 1,
        frozen: false,
      });
      continue;
    }

    if (!signatureMatches(existing.signature, object)) {
      writeSignature(existing.signature, object);
      existing.settledReviews = 1;
      if (existing.frozen) {
        existing.frozen = false;
        object.matrixAutoUpdate = true;
        object.updateMatrix();
        thawed += 1;
        state.frozenCount -= 1;
      }
      continue;
    }

    if (existing.frozen) continue;
    existing.settledReviews += 1;
    if (existing.settledReviews < MATRIX_FREEZE_SETTLED_REVIEWS) continue;
    // One last compose while it is still authoritative, so the matrix the
    // renderer keeps using is the correct one.
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    existing.frozen = true;
    froze += 1;
    state.frozenCount += 1;
  }

  return { reviewed, froze, thawed, frozen: state.frozenCount };
}

/** Hand every object back to three. Used on teardown, and by the overlay so a
 * suspected freeze bug can be ruled out without a reload. */
export function thawAllMatrices(
  objects: Iterable<FreezableObject>,
  state: MatrixFreezeState,
) {
  let thawed = 0;
  for (const object of objects) {
    const tracked = state.tracked.get(object);
    if (!tracked?.frozen) continue;
    tracked.frozen = false;
    tracked.settledReviews = 0;
    object.matrixAutoUpdate = true;
    object.updateMatrix();
    thawed += 1;
  }
  state.frozenCount = Math.max(0, state.frozenCount - thawed);
  return thawed;
}
