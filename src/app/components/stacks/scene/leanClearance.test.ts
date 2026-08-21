import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { HOVER_MOTION_SCALE, TIP } from "./Lift";
import { type Hinge, hingeFor } from "./interaction";
import {
  LEAN_CLEARANCE_MARGIN,
  LEGIBLE_LEAN,
  MAX_LEAN_SLIDE,
  SLIDE_DEPTH_SHARE,
  leanBudget,
  leanRise,
  maxLeanForRise,
} from "./leanClearance";
import {
  FLUTTER_MOTION,
  SWAY_MOTION,
  bandMotionFor,
} from "./reactionArchetype";

function hinge(
  over: Partial<Hinge> & Pick<Hinge, "swingHeight" | "depth" | "headroom">,
): Hinge {
  return {
    positiveTiltPivot: new THREE.Vector3(0, 0, over.depth / 2),
    negativeTiltPivot: new THREE.Vector3(0, 0, -over.depth / 2),
    size: Math.max(over.depth, Math.abs(over.swingHeight)),
    reason: null,
    ...over,
  };
}

/** A flat volume in a book row: `BookRowMesh` defaults, and neighbours placed
 * "one exact half-height above the plank; each height step then leaves
 * adjacent boards touching" — a gap of exactly zero. */
const FLAT_BOOK = { swingHeight: 0.052, depth: 0.24 };
/** The Musings paper stack under its pen. Depth is the collider's 0.465,
 * which is the widest mesh the Grabbable owns. */
const PAPER_STACK = { swingHeight: 0.0134, depth: 0.465 };

describe("lean rise geometry", () => {
  it("agrees with the small-angle guess only while the angle is small", () => {
    const h = hinge({ ...FLAT_BOOK, headroom: Infinity });
    expect(leanRise(h, 0.01)).toBeCloseTo(h.depth * 0.01, 5);
    // At the flutter band's 17 degrees the approximation is percent-level out,
    // and this number decides whether two solids overlap.
    const approximation = h.depth * FLUTTER_MOTION.lean;
    expect(
      Math.abs(leanRise(h, FLUTTER_MOTION.lean) - approximation),
    ).toBeGreaterThan(0.002);
  });

  it("inverts itself, which is the whole reason for the closed form", () => {
    for (const shape of [FLAT_BOOK, PAPER_STACK])
      for (const lean of [0.04, 0.12, 0.225, 0.3]) {
        const h = hinge({ ...shape, headroom: Infinity });
        expect(maxLeanForRise(h, leanRise(h, lean))).toBeCloseTo(lean, 6);
      }
  });

  it("takes the FIRST crossing on a prop tall enough to swing past its peak", () => {
    // A tall, shallow prop's rising corner climbs, peaks, and comes back down,
    // so two leans clear the same height — and the larger one got there by
    // passing through the ceiling on the way. A monstera is exactly this
    // shape. The cap has to hold for the whole swing, not just its endpoint.
    const tall = hinge({ swingHeight: 2.7, depth: 0.4, headroom: Infinity });
    const peak = Math.PI / 2 - Math.atan2(2.7, 0.4);
    const past = peak + 0.08;
    expect(leanRise(tall, past)).toBeLessThan(leanRise(tall, peak));
    const capped = maxLeanForRise(tall, leanRise(tall, past));
    expect(capped).toBeLessThan(peak);
    // The cap is honoured everywhere below it, which the far branch is not.
    for (let step = 0; step <= 20; step += 1)
      expect(leanRise(tall, (capped * step) / 20)).toBeLessThanOrEqual(
        leanRise(tall, capped) + 1e-9,
      );
  });

  it("says a prop cannot reach a height its arc never gets to", () => {
    // A short, shallow prop tipped through any angle never rises a metre.
    const h = hinge({ swingHeight: 0.05, depth: 0.05, headroom: Infinity });
    expect(maxLeanForRise(h, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts a standing prop's top rolling slightly DOWN as it swings back", () => {
    // The swingHeight term is negative for a prop resting on something, so the
    // true rise is a little under depth*sin. A plant is tall enough for it to
    // matter: ignoring it would over-report the rise by centimetres.
    const tall = hinge({ swingHeight: 2.7, depth: 0.4, headroom: Infinity });
    expect(leanRise(tall, SWAY_MOTION.lean)).toBeLessThan(
      0.4 * Math.sin(SWAY_MOTION.lean),
    );
  });
});

describe("lean budget", () => {
  it("leaves a prop with air over it completely alone", () => {
    const h = hinge({ ...FLAT_BOOK, headroom: Number.POSITIVE_INFINITY });
    expect(leanBudget(h, TIP)).toEqual({ lean: TIP, slide: 0 });
    expect(leanBudget(h, -TIP)).toEqual({ lean: -TIP, slide: 0 });
  });

  it("trades a blocked lean for a pull toward the viewer", () => {
    // The reported bug. A flat book carries its neighbour with no gap, and the
    // shared nod raises its rear corner by more than a whole book height.
    const h = hinge({ ...FLAT_BOOK, headroom: 0 });
    expect(leanRise(h, TIP)).toBeGreaterThan(FLAT_BOOK.swingHeight);
    const budget = leanBudget(h, TIP);
    expect(budget.lean).toBe(0);
    expect(budget.slide).toBeCloseTo(leanRise(h, TIP), 6);
  });

  it("never leans AND slides, so the answer stays one gesture", () => {
    for (const headroom of [0, 0.002, 0.01, 0.03, 0.08, 0.4, Infinity])
      for (const wanted of [TIP, -TIP, FLUTTER_MOTION.lean, SWAY_MOTION.lean]) {
        const budget = leanBudget(hinge({ ...FLAT_BOOK, headroom }), wanted);
        expect(budget.lean === 0 || budget.slide === 0).toBe(true);
      }
  });

  it("shrinks the lean to fit where there is partial room", () => {
    const h = hinge({ ...FLAT_BOOK, headroom: 0.03 });
    const budget = leanBudget(h, TIP);
    expect(budget.slide).toBe(0);
    expect(budget.lean).toBeGreaterThan(LEGIBLE_LEAN);
    expect(budget.lean).toBeLessThan(TIP);
    // The point of fitting rather than refusing: it uses nearly all the room.
    expect(leanRise(h, budget.lean)).toBeCloseTo(
      h.headroom - LEAN_CLEARANCE_MARGIN,
      6,
    );
  });

  it("keeps the sign of a backward lean while shrinking it", () => {
    // The medals lean AWAY. A cap that returned a positive angle would flip a
    // polished mark's face down into shadow, which is the failure the whole
    // shimmer band exists to avoid.
    const budget = leanBudget(hinge({ ...FLAT_BOOK, headroom: 0.03 }), -TIP);
    expect(budget.lean).toBeLessThan(0);
    expect(budget.lean).toBeGreaterThan(-TIP);
  });

  it("would rather slide than lean by an amount already known to be invisible", () => {
    // 2.1 degrees is what the old cameraFacingHoverTilt handed a top-shelf
    // prop, and the owner read the whole scene as unresponsive. Anything at or
    // under that is silence, so the prop changes channel instead.
    expect(LEGIBLE_LEAN).toBeLessThan(0.045);
    const h = hinge({ ...FLAT_BOOK, headroom: 0.006 });
    expect(maxLeanForRise(h, 0.006 - LEAN_CLEARANCE_MARGIN)).toBeLessThan(
      LEGIBLE_LEAN,
    );
    expect(leanBudget(h, TIP).slide).toBeGreaterThan(0);
  });

  it("caps the slide so a deep prop is not shoved off its plank", () => {
    // The paper stack is 0.465 deep, so the blocked flutter lean wants to move
    // it 0.137 — over a fifth of the shelf. Both caps bite.
    const h = hinge({ ...PAPER_STACK, headroom: 0 });
    expect(leanRise(h, FLUTTER_MOTION.lean)).toBeGreaterThan(0.13);
    const budget = leanBudget(h, FLUTTER_MOTION.lean);
    expect(budget.slide).toBe(MAX_LEAN_SLIDE);
    expect(budget.slide).toBeLessThan(h.depth * SLIDE_DEPTH_SHARE);
  });

  it("keeps the slide on the scene's one legibility dial", () => {
    // The band constants got this wrong twice, and both times the symptom was
    // "the movements are all too subtle" after the dial had been raised. A
    // channel expressed as a bare number opts out of the dial silently.
    expect(MAX_LEAN_SLIDE).toBeCloseTo(0.028 * HOVER_MOTION_SCALE, 12);
  });

  it("scales the slide with the prop, not just with the cap", () => {
    // A shallow prop should not be yanked as far as a deep one. On the flat
    // books the proportional cap and the blocked lean's own travel land within
    // a whisker of each other, which is why 0.25 of depth was chosen.
    const shallow = leanBudget(
      hinge({ swingHeight: 0.02, depth: 0.06, headroom: 0 }),
      TIP,
    );
    expect(shallow.slide).toBeLessThanOrEqual(0.06 * SLIDE_DEPTH_SHARE);
    expect(shallow.slide).toBeLessThan(MAX_LEAN_SLIDE);
  });

  it("leaves a HANGING prop alone, since nothing is stacked on a wall print", () => {
    const held = hinge({
      swingHeight: -0.4,
      depth: 0.3,
      headroom: Number.POSITIVE_INFINITY,
    });
    expect(leanBudget(held, TIP)).toEqual({ lean: TIP, slide: 0 });
  });

  it("passes a zero lean straight through, so glow stays still", () => {
    expect(bandMotionFor("glow").lean).toBe(0);
    expect(leanBudget(hinge({ ...FLAT_BOOK, headroom: 0 }), 0)).toEqual({
      lean: 0,
      slide: 0,
    });
  });
});

/** Build a stack of boxes the way `BookRowMesh` builds one, and measure it. */
function stackedRow(gap: number) {
  const row = new THREE.Group();
  const height = 0.052;
  const carriers: THREE.Group[] = [];
  for (let j = 0; j < 3; j += 1) {
    const carrier = new THREE.Group();
    carrier.position.set(j * 0.012, height / 2 + j * (height + gap), 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, height, 0.24));
    carrier.add(mesh);
    row.add(carrier);
    carriers.push(carrier);
  }
  row.updateMatrixWorld(true);
  return carriers;
}

describe("clearance measurement", () => {
  it("finds the neighbour resting on a stacked book", () => {
    const [bottom, middle, top] = stackedRow(0);
    for (const book of [bottom!, middle!]) {
      const measured = hingeFor(book, false, Number.POSITIVE_INFINITY);
      expect(measured?.headroom).toBeCloseTo(0, 6);
      expect(leanBudget(measured!, TIP).lean).toBe(0);
      expect(leanBudget(measured!, TIP).slide).toBeGreaterThan(0);
    }
    // The top of the stack has open air and keeps the full lean, which is what
    // makes the row read as books rather than as one moulded slab.
    const measuredTop = hingeFor(top!, false, Number.POSITIVE_INFINITY);
    expect(measuredTop?.headroom).toBe(Number.POSITIVE_INFINITY);
    expect(leanBudget(measuredTop!, TIP).lean).toBe(TIP);
  });

  it("reports the real gap when a stack is authored with one", () => {
    const [bottom] = stackedRow(0.09);
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });

  it("ignores a tall prop standing BESIDE a stack rather than on it", () => {
    // Without the contact test this is a false positive that silences a prop
    // with nothing on it at all: an upright book overlaps in x through the
    // stagger and rises far past the flat book's top.
    const [bottom] = stackedRow(0.09);
    const row = bottom!.parent!;
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.24));
    upright.position.set(0.01, 0.25, 0);
    row.add(upright);
    row.updateMatrixWorld(true);
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });

  it("ignores the plank the prop is standing on", () => {
    const [bottom] = stackedRow(0.09);
    const row = bottom!.parent!;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, 0.6));
    plank.position.set(0, -0.02, 0);
    row.add(plank);
    row.updateMatrixWorld(true);
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });

  it("ignores a neighbour that misses the prop's footprint", () => {
    const [bottom] = stackedRow(0.09);
    const row = bottom!.parent!;
    const elsewhere = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    elsewhere.position.set(0.9, 0.15, 0);
    row.add(elsewhere);
    row.updateMatrixWorld(true);
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });

  it("ignores helper geometry the rest of the scene already opts out", () => {
    // `physicsIgnore` is the shared marker for invisible hit volumes and line
    // shader backings, and `meshBoxInLocal` and physicsColliders both honour
    // it. An interaction-hit box is routinely larger than the prop it serves,
    // so counting one would silence its own neighbours.
    const [bottom] = stackedRow(0.09);
    const row = bottom!.parent!;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3));
    hit.position.set(0, 0.2, 0);
    hit.userData.physicsIgnore = true;
    row.add(hit);
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3));
    hidden.position.set(0, 0.2, 0);
    hidden.visible = false;
    row.add(hidden);
    row.updateMatrixWorld(true);
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });

  it("measures in the prop's own frame, through its parents' scale", () => {
    // The shelves run at 2.00 units/m and the floor at ~0.96, and a hinge that
    // mixed the two would cap the wrong props.
    const [bottom] = stackedRow(0.09);
    const row = bottom!.parent!;
    row.scale.setScalar(3);
    row.updateMatrixWorld(true);
    // The gap is stated in the PROP's units, which is what the rise it gets
    // compared against is also in. Scaling the whole shelf must not move it.
    expect(
      hingeFor(bottom!, false, Number.POSITIVE_INFINITY)?.headroom,
    ).toBeCloseTo(0.09, 6);
  });
});
