import { describe, expect, it } from "vitest";

import {
  MATRIX_FREEZE_REVIEW_MS,
  MATRIX_FREEZE_SETTLED_REVIEWS,
  createMatrixFreezeState,
  matrixFreezeDue,
  reviewMatrixFreeze,
  thawAllMatrices,
  type FreezableObject,
} from "./staticMatrixFreeze";

type Fake = FreezableObject & { composes: number };

const make = (): Fake => ({
  matrixAutoUpdate: true,
  position: { x: 0, y: 0, z: 0 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  composes: 0,
  updateMatrix() {
    this.composes += 1;
  },
});

/** Review `times` times, one cadence apart. */
function settle(objects: Fake[], state = createMatrixFreezeState(), times = MATRIX_FREEZE_SETTLED_REVIEWS) {
  let now = 0;
  let last = reviewMatrixFreeze([], state, now);
  for (let i = 0; i < times; i += 1) {
    last = reviewMatrixFreeze(objects, state, now);
    now += MATRIX_FREEZE_REVIEW_MS;
  }
  return { state, last, now };
}

describe("static matrix freeze", () => {
  it("freezes an object that has held still", () => {
    const still = make();
    const { last } = settle([still]);
    expect(still.matrixAutoUpdate).toBe(false);
    expect(last.froze).toBe(1);
  });

  it("composes once more before freezing, so the kept matrix is correct", () => {
    // After `matrixAutoUpdate` goes false nothing recomposes the local
    // matrix, so the pose captured on the way out has to be the current one.
    const still = make();
    settle([still]);
    expect(still.composes).toBe(1);
  });

  it("never freezes on a single quiet review", () => {
    const still = make();
    settle([still], createMatrixFreezeState(), 1);
    expect(still.matrixAutoUpdate).toBe(true);
  });

  it("leaves a mover alone however long it runs", () => {
    const mover = make();
    const state = createMatrixFreezeState();
    for (let i = 0; i < 40; i += 1) {
      mover.position.x = i * 0.01;
      reviewMatrixFreeze([mover], state, i * MATRIX_FREEZE_REVIEW_MS);
    }
    expect(mover.matrixAutoUpdate).toBe(true);
    expect(state.frozenCount).toBe(0);
  });

  it("thaws a frozen object the moment it moves again", () => {
    // The self-correcting property. An authored allowlist cannot do this, and
    // its failure mode is a prop silently stuck at the pose it was frozen in.
    const prop = make();
    const { state, now } = settle([prop]);
    expect(prop.matrixAutoUpdate).toBe(false);

    prop.position.y = 2;
    const review = reviewMatrixFreeze([prop], state, now);
    expect(prop.matrixAutoUpdate).toBe(true);
    expect(review.thawed).toBe(1);
    expect(state.frozenCount).toBe(0);
    // Composed again on the way back, so it does not draw at the frozen pose.
    expect(prop.composes).toBe(2);
  });

  it("notices rotation and scale, not only position", () => {
    for (const move of [
      (o: Fake) => (o.quaternion.w = 0.5),
      (o: Fake) => (o.scale.z = 1.5),
    ]) {
      const prop = make();
      const { state, now } = settle([prop]);
      expect(prop.matrixAutoUpdate).toBe(false);
      move(prop);
      reviewMatrixFreeze([prop], state, now);
      expect(prop.matrixAutoUpdate).toBe(true);
    }
  });

  it("can refreeze after the movement stops", () => {
    const prop = make();
    const { state, now } = settle([prop]);
    prop.position.x = 1;
    reviewMatrixFreeze([prop], state, now);
    expect(prop.matrixAutoUpdate).toBe(true);

    let clock = now + MATRIX_FREEZE_REVIEW_MS;
    for (let i = 0; i < MATRIX_FREEZE_SETTLED_REVIEWS; i += 1) {
      reviewMatrixFreeze([prop], state, clock);
      clock += MATRIX_FREEZE_REVIEW_MS;
    }
    expect(prop.matrixAutoUpdate).toBe(false);
  });

  it("counts only what it actually froze", () => {
    const still = make();
    const mover = make();
    const state = createMatrixFreezeState();
    let clock = 0;
    for (let i = 0; i < MATRIX_FREEZE_SETTLED_REVIEWS; i += 1) {
      mover.position.x = i;
      reviewMatrixFreeze([still, mover], state, clock);
      clock += MATRIX_FREEZE_REVIEW_MS;
    }
    expect(state.frozenCount).toBe(1);
    expect(still.matrixAutoUpdate).toBe(false);
    expect(mover.matrixAutoUpdate).toBe(true);
  });

  it("hands everything back on teardown", () => {
    const props = [make(), make(), make()];
    const { state } = settle(props);
    expect(state.frozenCount).toBe(3);
    expect(thawAllMatrices(props, state)).toBe(3);
    expect(props.every((p) => p.matrixAutoUpdate)).toBe(true);
    expect(state.frozenCount).toBe(0);
  });

  it("paces reviews rather than running every frame", () => {
    // Reviewing is itself a traversal. Running it per frame would spend the
    // traversal this exists to remove.
    const state = createMatrixFreezeState();
    expect(matrixFreezeDue(state, 0)).toBe(true);
    reviewMatrixFreeze([make()], state, 1_000);
    expect(matrixFreezeDue(state, 1_000)).toBe(false);
    expect(matrixFreezeDue(state, 1_000 + MATRIX_FREEZE_REVIEW_MS)).toBe(true);
  });

  it("tracks objects it has never seen without freezing them early", () => {
    const state = createMatrixFreezeState();
    const first = make();
    reviewMatrixFreeze([first], state, 0);
    const late = make();
    const review = reviewMatrixFreeze([first, late], state, MATRIX_FREEZE_REVIEW_MS);
    expect(review.reviewed).toBe(2);
    expect(review.froze).toBe(0);
    expect(late.matrixAutoUpdate).toBe(true);
  });
});
