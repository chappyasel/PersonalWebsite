import fs from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { TIP } from "./Lift";
import { type Hinge } from "./interaction";
import { leanBudget, leanRise } from "./leanClearance";
import { MUSINGS_PAPER_STACK } from "./musingsShelfGeometry";
import { FLUTTER_MOTION, archetypeFor } from "./reactionArchetype";

function source(path: string) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

function stackedHinge(swingHeight: number, depth: number): Hinge {
  return {
    positiveTiltPivot: new THREE.Vector3(0, 0, depth / 2),
    negativeTiltPivot: new THREE.Vector3(0, 0, -depth / 2),
    size: Math.max(swingHeight, depth),
    reason: null,
    swingHeight,
    depth,
    // The case both reported bugs are: a neighbour resting flat on the top
    // face with no authored gap at all.
    headroom: 0,
  };
}

/**
 * The two props the owner reported, pinned to the geometry they are actually
 * built from.
 *
 * Both are the same bug. ADR 0020 handed every prop an automatic lean and
 * argued the amplitude was safe because `hingeShift` pins the contact edge —
 * which is true of the plank BELOW and says nothing about what is stacked on
 * top. The scene already knew: `FLAT_LIFT` banned the vertical rise on exactly
 * this family, in a comment, years earlier. The rotation walked back into it.
 *
 * These assertions are deliberately computed from the real dimensions rather
 * than from remembered numbers, so a retune of the row or the paper stack has
 * to face the collision rather than quietly reopen it.
 */
describe("props with something stacked on them", () => {
  it("still builds the flat book row with its volumes touching", () => {
    // If this changes, the numbers below are stale and the test that uses them
    // is not measuring the scene any more.
    const text = source("./primitives.tsx");
    expect(text).toContain("const fallback = item.height ?? 0.052;");
    expect(text).toContain("(_, j) => item.heights?.[j] ?? fallback,");
    expect(text).toContain("depth={volume?.depth ?? item.depth ?? 0.24}");
    // Seats are the running sum of every thickness below each volume. This is
    // the variable-height form of the same touching-stack invariant.
    expect(text).toContain("const seats = useMemo(() => flatVolumeSeats(item)");
    expect(text).toMatch(
      /base=\{\[\s*item\.x \+ \(volume\?\.x \?\? j \* \(item\.staggerX \?\? 0\.012\)\),\s*seats\[j\]!,\s*volume\?\.z \?\? 0,\s*\]\}/,
    );
  });

  it("refuses to swing a stacked book through the one above it", () => {
    const book = stackedHinge(0.052, 0.24);
    // The collision, stated: the shared nod raises the rear corner further
    // than a whole book height, into a neighbour with nowhere to go.
    expect(leanRise(book, TIP)).toBeGreaterThan(0.052);
    const budget = leanBudget(book, TIP);
    expect(budget.lean).toBe(0);
    // ...and it does not go quiet. Silence is what this workstream exists to
    // remove; the travel is spent pulling the volume toward the viewer, which
    // is what a person does with a stacked book and what FLAT_LIFT already
    // chose for this family in translation.
    expect(budget.slide).toBeGreaterThan(0.04);
  });

  it("leaves the top of the stack leaning, so a row is not one slab", () => {
    const top: Hinge = {
      ...stackedHinge(0.052, 0.24),
      headroom: Number.POSITIVE_INFINITY,
    };
    expect(leanBudget(top, TIP)).toEqual({ lean: TIP, slide: 0 });
  });

  it("still rests the Musings pen directly on the paper it lies on", () => {
    const text = source("./objects.tsx");
    // penBase y is the top sheet plus the pen's own radius: contact, no gap.
    expect(text).toContain("paperThickness + sheetStep * 4 + 0.009,");
    expect(text).toContain(
      "cylinderGeometry args={[0.0085, 0.0085, 0.272, 16]}",
    );
    // Both are their own Grabbable — "the pen remains its own prop" — so
    // nothing makes the pen ride the paper when the paper moves.
    expect(text).toContain("hoverKey={`grab:pen:${linkUnit}`}");
    expect(text).toContain("hoverKey={`grab:paper:${linkUnit}`}");
  });

  it("refuses to sweep the paper stack through its own pen", () => {
    // 0.024 kg is the lightest band in the scene, and flutter asks for the
    // largest lean in the scene. On a prop this deep that is a heave.
    expect(archetypeFor({ massKg: 0.024 })).toBe("flutter");
    const paper = stackedHinge(
      MUSINGS_PAPER_STACK.colliderHeight,
      MUSINGS_PAPER_STACK.colliderDepth,
    );
    expect(leanRise(paper, FLUTTER_MOTION.lean)).toBeGreaterThan(0.1);
    const budget = leanBudget(paper, FLUTTER_MOTION.lean);
    expect(budget.lean).toBe(0);
    expect(budget.slide).toBeGreaterThan(0);
    // The pen keeps its footing all the way. The stack slides out from under
    // it rather than out of contact with it, which is why the slide is capped
    // well inside the paper's own depth rather than at a fixed distance.
    const penZ = 0.095;
    expect(penZ + budget.slide).toBeLessThan(
      MUSINGS_PAPER_STACK.colliderDepth / 2,
    );
  });

  it("keeps the pen itself leaning, since nothing is stacked on a pen", () => {
    expect(archetypeFor({ massKg: 0.012 })).toBe("flutter");
    const pen: Hinge = {
      ...stackedHinge(0.017, 0.17),
      headroom: Number.POSITIVE_INFINITY,
    };
    expect(leanBudget(pen, FLUTTER_MOTION.lean).lean).toBe(FLUTTER_MOTION.lean);
  });

  it("keeps the About reading fan on its bespoke lanes", () => {
    // Same bug, solved by hand before the rule existed: "the shared hinged nod
    // makes this tightly fanned trio swing through its neighbors." Left alone
    // deliberately — the derived answer pulls straight toward the viewer, and
    // this stack peels its outer books sideways into their own clear lanes,
    // which is a better answer for three overlapping jackets than one lane
    // they would all take at once.
    const text = source("./units/UnitAbout.tsx");
    expect(text).toContain("tiltOnHover={false}");
    expect(text).toContain("READING_HOVER_OFFSETS");
  });
});
