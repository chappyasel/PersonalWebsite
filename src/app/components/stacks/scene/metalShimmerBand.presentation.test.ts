import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SHIMMER_MOTION,
  archetypeFor,
  bandMotionFor,
} from "./reactionArchetype";

function source(path: string) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * ADR 0020 band two. Every prop that owns `useMetalShimmer` must also declare
 * `metal`, or it resolves to `tip` and answers TWICE: the shimmer it was built
 * for, plus the shared nod on top.
 *
 * That was the state of the world before this test. `Grabbable`'s `tiltOnHover`
 * doc has claimed since long before ADR 0020 that "reflective marks use shimmer
 * instead of the shared nod because even a small pitch can move their
 * environment highlight off the face" — and not one metal prop actually set it.
 * The nod was 2.1 degrees on a top-shelf prop then, so nobody noticed. It is
 * 12.9 now, which is more than enough to slide a highlight off a flat face.
 */
describe("metal shimmer band", () => {
  const SHIMMER_PROPS: Array<[string, string, string]> = [
    [
      "projects apple mark",
      "./units/UnitProjects.tsx",
      'hoverKey="shimmer:apple"',
    ],
    [
      "ai collective mark",
      "./units/UnitAbout.tsx",
      'hoverKey="grab:ai-collective-mark"',
    ],
    ["tj medallion", "./AuthoredProps.tsx", "hoverKey={TJ_MEDALLION_HOVER}"],
    ["project icon", "./units/ProjectArtifacts.tsx", "hoverKey={hoverKey}"],
  ];

  it.each(SHIMMER_PROPS)(
    "declares metal on %s so it shimmers instead of nodding",
    (_name, file, anchor) => {
      const text = source(file);
      const start = text.indexOf(anchor);
      expect(start).toBeGreaterThanOrEqual(0);
      // The props block ends at the first `>` that closes the opening tag.
      const end = text.indexOf(">", start);
      expect(text.slice(start, end)).toContain("metal");
    },
  );

  it("carries a backward lean rather than no lean", () => {
    // `metal` is the intent ("this is a polished mark"); leaning AWAY is the
    // consequence, and it comes from the band table rather than from each call
    // site remembering a flag. An earlier cut suppressed the tilt outright;
    // owner call on 2026-08-20 was that these want their own backward tilt.
    expect(SHIMMER_MOTION.lean).toBeLessThan(0);
    expect(bandMotionFor("shimmer").lean).toBe(SHIMMER_MOTION.lean);
  });

  it("lets metal answer before size would silence it", () => {
    // The project icons are deliberately about twice the height of the 15cm
    // Apple mark. Ordering size first would hand them `glow` and drop the
    // treatment they were built around.
    expect(archetypeFor({ metal: true, size: 1.4, massKg: 0.62 })).toBe(
      "shimmer",
    );
    expect(archetypeFor({ metal: true, massKg: 60 })).toBe("shimmer");
  });

  it("still lets foliage win, since a planter is not a mark", () => {
    expect(archetypeFor({ colliderProfile: "foliage-base", metal: true })).toBe(
      "sway",
    );
  });
});
