import { describe, expect, it } from "vitest";

import { LIFT_LAMBDA, TIP } from "./Lift";
import { TILT_MAX_SIZE } from "./interaction";
import {
  FLUTTER_MAX_KG,
  FLUTTER_MOTION,
  SHIMMER_MOTION,
  STRAIN_HEAVY_MOTION,
  STRAIN_MASSIVE_MOTION,
  STRAIN_MIN_KG,
  SWAY_MOTION,
  TIP_MOTION,
  archetypeCensus,
  archetypeFor,
  bandMotionFor,
  clearArchetypeCensus,
  recordArchetype,
  reducedMotionArchetype,
} from "./reactionArchetype";

describe("reaction archetype derivation", () => {
  it("classifies foliage before mass, which is the whole correction", () => {
    // Plants are heavy because of their POTS. Every one of these would sort
    // into a weight band that made it strain like a dumbbell if mass were
    // consulted first, and the yucca clears the iron line outright.
    const plants = [
      { name: "about-succulent", massKg: 1.2 },
      { name: "musings", massKg: 1.4 },
      { name: "projects-small", massKg: 1.4 },
      { name: "about-cactus", massKg: 1.6 },
      { name: "talks-top", massKg: 2.1 },
      { name: "talks-pothos", massKg: 2.3 },
      { name: "sansevieria", massKg: 2.4 },
      { name: "about-large", massKg: 3.1 },
      { name: "projects-yucca", massKg: 5.6 },
    ];
    for (const plant of plants) {
      expect(
        archetypeFor({
          colliderProfile: "foliage-base",
          massKg: plant.massKg,
        }),
        plant.name,
      ).toBe("sway");
    }
  });

  it("sways a plant even when it measures as furniture", () => {
    // The monstera and the large plants clear TILT_MAX_SIZE. Sorting by size
    // first would silence exactly the props whose leaves move most.
    expect(
      archetypeFor({
        colliderProfile: "foliage-base",
        size: 2.71,
        massKg: 3.1,
      }),
    ).toBe("sway");
  });

  it("lets metal answer before size silences it", () => {
    // The project icons are deliberately large. A size-first rule would make
    // them glow instead of using the shimmer they already own.
    expect(archetypeFor({ metal: true, size: 1.4, massKg: 0.42 })).toBe(
      "shimmer",
    );
  });

  it("glows anything too big to be other than furniture", () => {
    // Stated as the RULE, not as a prop list. The census in interaction.ts
    // still MEASURES an eames chair and a ladder that have since left the
    // scene, and asserting against a stale list is how that stayed unnoticed.
    // `window.__stacksArchetypes()` is the live population.
    for (const size of [TILT_MAX_SIZE + 0.001, 1.5, 2.5, 3.1]) {
      expect(archetypeFor({ size, massKg: 0.5 })).toBe("glow");
    }
  });

  it("keeps the size cut on TILT_MAX_SIZE rather than a new number", () => {
    expect(archetypeFor({ size: TILT_MAX_SIZE, massKg: 0.5 })).toBe("tip");
    expect(archetypeFor({ size: TILT_MAX_SIZE + 1e-6, massKg: 0.5 })).toBe(
      "glow",
    );
  });

  it("sorts the real authored mass population into bands", () => {
    // Every non-foliage authored massKg in the scene, so a retune of the
    // thresholds has to face the actual population rather than an example.
    const population: Array<[string, number, string]> = [
      ["vineyard-vines sticker", 0.006, "flutter"],
      ["liars dice die", 0.025, "flutter"],
      ["harmonica", 0.18, "tip"],
      ["phone", 0.19, "tip"],
      ["shaker", 0.25, "tip"],
      ["tea cup", 0.3, "tip"],
      ["apple mark", 0.35, "tip"],
      ["soda can", 0.36, "tip"],
      ["paper stack", 0.38, "tip"],
      ["ai-collective mark", 0.42, "tip"],
      ["alarm clock", 0.45, "tip"],
      ["notebook", 0.45, "tip"],
      ["routine board", 0.45, "tip"],
      ["basketball", 0.62, "tip"],
      ["reading book", 0.62, "tip"],
      ["bookend", 0.7, "tip"],
      ["microphone", 0.7, "tip"],
      ["open book", 0.72, "tip"],
      ["book pile volume", 0.72, "tip"],
      ["photo frame", 0.82, "tip"],
      ["protein tub", 0.9, "tip"],
      ["sailboat", 0.9, "tip"],
      ["globe", 1.4, "tip"],
      ["trophy", 1.8, "tip"],
      ["mac", 7.5, "strain"],
      ["dumbbell", 10, "strain"],
      ["dumbbell left", 12, "strain"],
      ["kettlebell", 16, "strain"],
      ["barbell", 60, "strain"],
    ];
    for (const [name, massKg, expected] of population) {
      expect(archetypeFor({ massKg }), name).toBe(expected);
    }
  });

  it("puts the band boundaries where the constants say", () => {
    expect(archetypeFor({ massKg: FLUTTER_MAX_KG })).toBe("flutter");
    expect(archetypeFor({ massKg: FLUTTER_MAX_KG + 1e-6 })).toBe("tip");
    expect(archetypeFor({ massKg: STRAIN_MIN_KG })).toBe("tip");
    expect(archetypeFor({ massKg: STRAIN_MIN_KG + 1e-6 })).toBe("strain");
  });

  it("never returns nothing, because inert props are half the complaint", () => {
    // A prop whose GLB has not streamed in has no size and may have no
    // authored mass. It still answers a pointer, with what the whole world
    // did before ADR 0020.
    expect(archetypeFor({})).toBe("tip");
    expect(archetypeFor({ size: undefined, massKg: undefined })).toBe("tip");
  });

  it("leaves the tip band on the shared nod constant", () => {
    // Most of the world is this band. ADR 0020 moved the ends away from the
    // shared nod; it did not retune the middle.
    expect(TIP_MOTION.lean).toBe(TIP);
    expect(bandMotionFor("tip", 0.62)).toEqual(TIP_MOTION);
  });

  it("falls in lean AND in bounce together, so weight reads as weight", () => {
    // A small FAST movement is a twitch. A small SLOW one is mass. Lean and
    // damping ratio have to fall together across the bands, which is the same
    // call MASS_HANDLING already made for carrying.
    const ratio = (m: { stiffness: number; damping: number }) =>
      m.damping / (2 * Math.sqrt(m.stiffness));
    const ladder = [
      FLUTTER_MOTION,
      TIP_MOTION,
      STRAIN_HEAVY_MOTION,
      STRAIN_MASSIVE_MOTION,
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!.lean).toBeLessThan(ladder[i - 1]!.lean);
      // Higher ratio = less bounce. Paper overshoots, iron does not.
      expect(ratio(ladder[i]!)).toBeGreaterThan(ratio(ladder[i - 1]!));
    }
    // Iron genuinely does not bounce: at or past critical damping.
    expect(ratio(STRAIN_MASSIVE_MOTION)).toBeGreaterThanOrEqual(1);
    // Paper genuinely does: well under it.
    expect(ratio(FLUTTER_MOTION)).toBeLessThan(0.5);
  });

  it("leans a polished mark BACKWARD, and nothing else", () => {
    // A medal is a flat face carrying an environment highlight. Pitching it
    // toward you rolls the highlight off and puts the artwork in shadow;
    // leaning it away turns the face up toward a camera above the shelf line.
    // It is the gesture of tilting a coin to read it.
    expect(SHIMMER_MOTION.lean).toBeLessThan(0);
    for (const motion of [
      FLUTTER_MOTION,
      TIP_MOTION,
      SWAY_MOTION,
      STRAIN_HEAVY_MOTION,
      STRAIN_MASSIVE_MOTION,
    ]) {
      expect(motion.lean).toBeGreaterThan(0);
    }
    // Smaller than the shared nod and stiffer: a mark that swings reads as
    // loose rather than as machined.
    expect(Math.abs(SHIMMER_MOTION.lean)).toBeLessThan(TIP);
    expect(SHIMMER_MOTION.stiffness).toBeGreaterThan(TIP_MOTION.stiffness);
  });

  it("gives only foliage a twist", () => {
    expect(SWAY_MOTION.twist).toBeGreaterThan(0);
    for (const a of ["tip", "flutter", "strain", "shimmer", "glow"] as const)
      expect(bandMotionFor(a, 1).twist).toBe(0);
  });

  it("splits iron on the line massClassFor already draws", () => {
    expect(bandMotionFor("strain", 7.5)).toEqual(STRAIN_HEAVY_MOTION);
    expect(bandMotionFor("strain", 20)).toEqual(STRAIN_HEAVY_MOTION);
    expect(bandMotionFor("strain", 60)).toEqual(STRAIN_MASSIVE_MOTION);
    expect(bandMotionFor("strain", 60).lean).toBeLessThan(TIP / 4);
  });

  it("is the only band that out-moves the shared nod, for paper", () => {
    for (const massKg of [0.006, 0.025]) {
      const motion = bandMotionFor(archetypeFor({ massKg }), massKg);
      expect(motion).toEqual(FLUTTER_MOTION);
      expect(motion.lean).toBeGreaterThan(TIP);
    }
  });

  it("never rotates furniture", () => {
    expect(bandMotionFor("glow").lean).toBe(0);
    expect(bandMotionFor("glow").twist).toBe(0);
  });

  it("collapses to a non-motion channel under reduced motion", () => {
    // Reduced motion means no MOTION, not no ANSWER.
    expect(reducedMotionArchetype("sway")).toBe("glow");
    expect(reducedMotionArchetype("tip")).toBe("glow");
    expect(reducedMotionArchetype("flutter")).toBe("glow");
    expect(reducedMotionArchetype("strain")).toBe("glow");
    expect(reducedMotionArchetype("shimmer")).toBe("shimmer");
    expect(reducedMotionArchetype("glow")).toBe("glow");
  });

  it("sorts the census by band so a stray prop stands out", () => {
    clearArchetypeCensus();
    recordArchetype({
      id: "grab:barbell",
      archetype: "strain",
      source: "grabbable",
      massKg: 60,
    });
    recordArchetype({
      id: "grab:plant:musings",
      archetype: "sway",
      source: "grabbable",
      massKg: 1.4,
    });
    recordArchetype({
      id: "prop:grandfather-clock",
      archetype: "glow",
      source: "floor",
      size: 2.455,
    });
    recordArchetype({
      id: "grab:mug",
      archetype: "tip",
      source: "grabbable",
      massKg: 0.42,
    });
    expect(archetypeCensus().map((row) => row.archetype)).toEqual([
      "glow",
      "strain",
      "sway",
      "tip",
    ]);
    clearArchetypeCensus();
  });

  it("keys the census by id, so a remount does not double-count", () => {
    clearArchetypeCensus();
    recordArchetype({
      id: "grab:mug",
      archetype: "tip",
      source: "grabbable",
      massKg: 0.42,
    });
    recordArchetype({
      id: "grab:mug",
      archetype: "tip",
      source: "grabbable",
      massKg: 0.42,
    });
    expect(archetypeCensus()).toHaveLength(1);
    clearArchetypeCensus();
  });

  it("gives the props that are actually in the scene the glow band", () => {
    // The floor authors no mass, so size is the only input it has. Names
    // checked against the live `url="/models/*.glb"` set on 2026-08-20: the
    // eames chair and the ladder that interaction.ts still measures were both
    // removed from the world, and asserting on a list rather than on the rule
    // above is how that went unnoticed for as long as it did.
    const furniture: Array<[string, number]> = [
      ["golf club", 2.192],
      ["floor lamp", 2.451],
      ["grandfather clock", 2.455],
      ["monstera", 2.71],
    ];
    for (const [name, size] of furniture) {
      expect(archetypeFor({ size }), name).toBe("glow");
    }
  });
});
