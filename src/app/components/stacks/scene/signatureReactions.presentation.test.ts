import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { TIP } from "./Lift";
import {
  SIGNATURE_MOTION,
  SIGNATURE_REACTIONS,
  archetypeFor,
  bandMotionFor,
  reducedMotionArchetype,
  signatureChannel,
} from "./reactionArchetype";

const SCENE = new URL(".", import.meta.url).pathname;

/** Every .tsx/.ts in the scene tree, minus tests — the props themselves. */
function sceneSources(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
        out.push([full, fs.readFileSync(full, "utf8")]);
    }
  };
  walk(SCENE);
  return out;
}

/**
 * ADR 0020's deliberate exception: a short list of props whose gesture belongs
 * to the object rather than to its class.
 *
 * The list is the risk. This repo has already shipped a measured census naming
 * an eames chair and a ladder that had both left the scene, and the names
 * survived long enough to propagate into a test. So every entry here has to
 * point at something that is still in the world, and every entry has to be
 * WIRED — a signature nobody registered is a prop still answering with the
 * shared nod while a list claims otherwise.
 */
describe("signature reactions", () => {
  const sources = sceneSources();

  it.each(SIGNATURE_REACTIONS.map((s) => [s.hoverKey, s] as const))(
    "%s is still a prop in the scene",
    (hoverKey, reaction) => {
      const placed = sources.filter(([file, text]) => {
        if (file.endsWith("reactionArchetype.ts")) return false; // the list itself
        return text.includes(`"${hoverKey}`) || text.includes(`${hoverKey}$`);
      });
      expect(placed.length, `${hoverKey} is placed nowhere`).toBeGreaterThan(0);
      expect(reaction.owner).not.toBe("");
    },
  );

  const STANDS_A_NOD_DOWN = SIGNATURE_REACTIONS.filter(
    (s) => s.replaces === "nod",
  );

  it.each(STANDS_A_NOD_DOWN.map((s) => [s.hoverKey, s.gesture] as const))(
    "%s passes signature, so its Grabbable stops nodding underneath",
    (hoverKey, gesture) => {
      // Only the props that HAVE a shared reaction to remove. An EggTrigger
      // prop has no Grabbable to override — `ancestorHandlesHover` already
      // stood the universal floor down — so there is nothing to pass, and
      // requiring it there would be requiring a no-op.
      const wired = sources.some(([, text]) => {
        const at = text.indexOf(`signature="${gesture}"`);
        if (at < 0) return false;
        // The enclosing component, not the props block: ShakerProp builds its
        // key into a const, so `grab:shaker:` never appears in the JSX. A
        // component is still narrow enough that one signature prop cannot
        // vouch for another in the same unit.
        const start = Math.max(
          text.lastIndexOf("\nfunction ", at),
          text.lastIndexOf("\nexport function ", at),
        );
        return text.slice(start < 0 ? 0 : start, at).includes(hoverKey);
      });
      expect(wired, `${hoverKey} never passes signature="${gesture}"`).toBe(
        true,
      );
    },
  );

  it("expects a stand-down from every signature that is on a Grabbable", () => {
    // The inverse guard. Marking an entry `"silence"` is what exempts it from
    // the wiring check above, so a wrong label is a silent way to have a prop
    // answer twice while the list says it does not. The alarm clock was
    // labelled this way and was nodding under its own shiver.
    for (const reaction of SIGNATURE_REACTIONS) {
      if (reaction.replaces !== "silence") continue;
      const onGrabbable = sources.some(([, text]) => {
        const at = text.indexOf(`hoverKey="${reaction.hoverKey}"`);
        if (at < 0) return false;
        const open = text.lastIndexOf("<", at);
        return text.slice(open, at).includes("Grabbable");
      });
      expect(
        onGrabbable,
        `${reaction.hoverKey} is on a Grabbable, so it replaces a nod`,
      ).toBe(false);
    }
  });

  it.each(SIGNATURE_REACTIONS.map((s) => [s.hoverKey, s.owner] as const))(
    "%s names an owner that exists",
    (_hoverKey, owner) => {
      // "Glint in units/UnitProjects.tsx" — both halves have to be real, so
      // the list leads somewhere rather than reading as documentation.
      const [symbol, file] = owner.split(" in ");
      expect(file).toBeTruthy();
      const full = path.join(SCENE, file!);
      expect(fs.existsSync(full), `${file} does not exist`).toBe(true);
      expect(fs.readFileSync(full, "utf8")).toContain(symbol!);
    },
  );

  it("keeps the list short enough to argue with", () => {
    // ADR 0020: "bands plus a ~10-prop signature shortlist". Once this list
    // is long it has stopped being an exception, and the derivation has
    // stopped being the mechanism.
    expect(SIGNATURE_REACTIONS.length).toBeLessThanOrEqual(12);
  });

  it("has no duplicate hoverKeys", () => {
    const keys = SIGNATURE_REACTIONS.map((s) => s.hoverKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("beats every derived rule, because that is what an override is", () => {
    // A MOTION signature that lost to the prop's weight, size or material
    // would never fire. The basketball is the only sphere in the scene and is
    // 0.62 kg; the globe is 1.4; a plant could in principle own one.
    expect(archetypeFor({ signature: "roll", massKg: 0.62 })).toBe("signature");
    expect(archetypeFor({ signature: "spin", massKg: 60 })).toBe("signature");
    expect(archetypeFor({ signature: "shiver", metal: true })).toBe(
      "signature",
    );
    expect(archetypeFor({ signature: "slosh", size: 3.1 })).toBe("signature");
    expect(
      archetypeFor({ signature: "roll", colliderProfile: "foliage-base" }),
    ).toBe("signature");
  });

  it("treats an unclassified gesture as motion", () => {
    // The safe default: a name nobody has classified is more likely to be a
    // new animation than a new shader, and a quiet prop is a smaller failure
    // than two gestures fighting.
    expect(signatureChannel("something-nobody-listed")).toBe("motion");
    expect(archetypeFor({ signature: "something-nobody-listed" })).toBe(
      "signature",
    );
  });

  it("lets a SURFACE signature keep the band it sits on top of", () => {
    // Owner review, 2026-08-20: "with the trophy i can't really tell there's
    // glint. I also want the nod", and "I can't tell the tea cup is doing
    // anything". Both are props whose signature never moves the prop, so
    // standing the band down left them completely still in silhouette.
    expect(signatureChannel("glint")).toBe("surface");
    expect(signatureChannel("steam")).toBe("surface");
    expect(archetypeFor({ signature: "glint", massKg: 1.8 })).toBe("tip");
    expect(archetypeFor({ signature: "steam", massKg: 0.3 })).toBe("tip");
    expect(
      bandMotionFor(archetypeFor({ signature: "glint", massKg: 1.8 })).lean,
    ).toBe(TIP);
  });

  it("supplies no shared motion to a MOTION signature, so nothing doubles", () => {
    // Two movements at once is the incoherent case: a globe that turns and
    // leans is two gestures rather than one.
    expect(bandMotionFor("signature")).toEqual(SIGNATURE_MOTION);
    expect(SIGNATURE_MOTION.lean).toBe(0);
    expect(SIGNATURE_MOTION.twist).toBe(0);
    expect(TIP).toBeGreaterThan(0); // the nod a motion prop no longer gets
  });

  it("keeps its own reaction under reduced motion", () => {
    // Every signature component reads prefers-reduced-motion itself; they had
    // to, because they were all animating before ADR 0020 existed. Collapsing
    // them to the generic brighten would be a downgrade, not an accommodation.
    expect(reducedMotionArchetype("signature")).toBe("signature");
  });

  it("does not silently drop a prop that used to be listed", () => {
    // The six the owner approved. A seventh is fine; losing one of these
    // means a prop quietly went back to the shared nod.
    const keys = SIGNATURE_REACTIONS.map((s) => s.hoverKey);
    for (const expected of [
      "grab:trophy",
      "egg:tea",
      "grab:shaker:",
      "grab:basketball",
      "egg:globe",
      "egg:clock:alarm",
    ])
      expect(keys).toContain(expected);
  });

  it("records that every one of the six already had a nod", () => {
    // Not the expectation going in: the shortlist was written as "props that
    // do nothing on hover". Every one turned out to be a composed
    // registration — an egg sharing a hoverKey with a Grabbable — so each was
    // doing its own thing AND taking the shared lean.
    expect(SIGNATURE_REACTIONS.every((s) => s.replaces === "nod")).toBe(true);
  });

  it("only takes the nod away from props that move themselves", () => {
    // The correction. Removing it from all six made the two surface props
    // read as doing nothing at all, which is the failure this whole ADR
    // exists to remove — reintroduced by the fix for it.
    for (const reaction of SIGNATURE_REACTIONS) {
      const kept = archetypeFor({ signature: reaction.gesture, massKg: 1 });
      expect(kept === "signature").toBe(reaction.channel === "motion");
    }
  });
});

/**
 * The basketball's spin, pinned to the failure it shipped with.
 *
 * The first cut turned the ball about a canted HORIZONTAL axis through the
 * group's origin — which on a Grabbable is the contact point on the plank, not
 * the middle of the ball. Owner: "it just slowly rotates into the bottom shelf
 * haha". Both halves of that are asserted here, because the arithmetic is the
 * only part a screenshot of a sphere cannot show.
 */
describe("the basketball spins from its centre", () => {
  const eggs = fs.readFileSync(path.join(SCENE, "eggs.tsx"), "utf8");

  it("turns about the vertical, so a revolution is a real 360", () => {
    expect(eggs).toContain("g.rotation.y = angle.current;");
    // The horizontal axis is what buried it. Nothing should reintroduce one.
    expect(eggs).not.toContain("ROLL_AXIS");
    expect(eggs).not.toContain("rotateOnAxis");
  });

  it("pins the measured centre rather than the group origin", () => {
    expect(eggs).toContain("meshBoxInLocal(g)");
    expect(eggs).toContain("pivot.x - shifted.x");
    expect(eggs).toContain("pivot.z - shifted.z");
  });

  it("caps the hop on the same clearance a stacked book uses", () => {
    expect(eggs).toContain("clearanceAbove(g, box)");
  });

  it("lets go the moment the ball is picked up", () => {
    // This writes a CHILD of the Grabbable's carrier while the solver writes
    // the carrier itself, and the collider is built by walking that subtree —
    // so a ball still spinning in hand is a ball whose hull is being
    // remeasured mid-flight. Owner: "it messes with the physics."
    expect(eggs).toContain("state.dragging === hoverKey");
    // A grab is not the only way it leaves the shelf. The solver owns the
    // carrier's rotation through the throw, the tumble and the landing.
    expect(eggs).toContain("HANDLED_ROTATION_EPSILON");
    expect(eggs).toContain("state.hovered === hoverKey && !handled");
  });

  it("stops much faster than it coasts", () => {
    // A pointer leaving is a ball coasting; a hand closing on it is a ball
    // being stopped. One lambda cannot be right for both.
    const coast = /SPIN_COAST_LAMBDA = (\d+(?:\.\d+)?)/.exec(eggs);
    const stop = /SPIN_STOP_LAMBDA = (\d+(?:\.\d+)?)/.exec(eggs);
    expect(coast).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(Number(stop![1])).toBeGreaterThan(Number(coast![1]) * 3);
    // 95% of the spin gone inside a fifth of a second.
    expect(3 / Number(stop![1])).toBeLessThan(0.2);
  });

  it("drops the hop without a bounce while the ball is in hand", () => {
    // Overshooting back down through the palm is the same fight in the other
    // axis. Past critical damping for a stiffness of 340.
    expect(eggs).toContain("handled ? 48 : 17");
    expect(48 / (2 * Math.sqrt(340))).toBeGreaterThan(1);
    expect(17 / (2 * Math.sqrt(340))).toBeLessThan(1);
  });

  it("shows why the old axis drove the ball through the plank", () => {
    // The measured basketball is ~0.67 across, so its middle rides ~0.335
    // above the plank it rests on. Tumbling THAT about a horizontal axis
    // through the plank swings the whole ball, and by a quarter turn its
    // lowest point is a third of a unit under the wood.
    const radius = 0.335;
    const centre = new THREE.Vector3(0, radius, 0);
    const axis = new THREE.Vector3(0.82, 0, 0.57).normalize();
    // It starts sinking immediately and never recovers within the first turn.
    expect(centre.clone().applyAxisAngle(axis, 0.5).y).toBeLessThan(radius);
    // Half a turn puts the middle of the ball a full radius UNDER the plank:
    // the axis lies in the horizontal plane, so a rotation of pi maps a point
    // directly above it to the same distance directly below.
    expect(centre.clone().applyAxisAngle(axis, Math.PI).y).toBeCloseTo(
      -radius,
      6,
    );

    // The vertical axis moves a centred ball not at all, at any angle — which
    // is what makes the spin safe without a clearance test of its own.
    for (const angle of [0.5, 1.7, Math.PI, 5.9]) {
      const spun = centre
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      expect(spun.y).toBeCloseTo(radius, 12);
      expect(spun.length()).toBeCloseTo(radius, 12);
    }
  });

  it("keeps the pivot identity honest for an off-centre ball", () => {
    // The model does sit over the origin today, but "very nearly centred" is
    // exactly how the first version was wrong, so the shift is measured.
    const pivot = new THREE.Vector3(0.04, 0, -0.02);
    for (const angle of [0.3, 2.2, 4.8]) {
      const euler = new THREE.Euler(0, angle, 0);
      const shifted = pivot.clone().applyEuler(euler);
      const position = new THREE.Vector3(
        pivot.x - shifted.x,
        0,
        pivot.z - shifted.z,
      );
      // The pivot point, carried through the group's own transform, lands
      // exactly back on itself.
      const carried = pivot.clone().applyEuler(euler).add(position);
      expect(carried.x).toBeCloseTo(pivot.x, 12);
      expect(carried.z).toBeCloseTo(pivot.z, 12);
    }
  });
});

/**
 * Additive light compounds in this scene's linear HDR pipeline, and a
 * surface signature that reaches for it stops being a highlight and becomes a
 * clip. Both of these were shipped and both were caught by looking, not by a
 * test — which is what this is for.
 */
describe("surface signatures do not reach for raw radiance", () => {
  it("keeps emissive out of the trophy's glint", () => {
    // Shipped at 0.55/0.44/0.20 and rendered the cup as a flat cream cut-out.
    // Two mistakes: the amount (the v4 bloom work landed on x0.45 where x1.3
    // had been assumed, so half a unit of added radiance is a white clip
    // after ACES) and the channel (emissive is added regardless of the
    // normal, so it does not brighten a form, it erases one).
    const text = fs.readFileSync(
      path.join(SCENE, "units/UnitProjects.tsx"),
      "utf8",
    );
    const glint = text.slice(
      text.indexOf("function Glint("),
      text.indexOf("Pixel Happy Mac boot mark"),
    );
    // The WRITE, not the word: the comment above it explains why it is gone.
    expect(glint).not.toContain("mat.emissive");
    expect(glint).not.toContain("emissiveIntensity =");
    // The channels it may use are the ones that still respect the geometry.
    expect(glint).toContain("mat.envMapIntensity");
    expect(glint).toContain("mat.roughness");
  });

  it("spends the tea cup's hover on plume SIZE more than on opacity", () => {
    // Nine wisps, additively blended in the dark theme. Opacity there is
    // radiance that overlaps and compounds; size is not.
    const eggs = fs.readFileSync(path.join(SCENE, "eggs.tsx"), "utf8");
    const peak = /hover \* ([\d.]+)\) \* fade/.exec(eggs);
    const size = /boost \* 0\.16 \+ hover \* ([\d.]+)\)/.exec(eggs);
    expect(peak).not.toBeNull();
    expect(size).not.toBeNull();
    expect(Number(peak![1])).toBeLessThanOrEqual(Number(size![1]) + 0.1);
    // And never anywhere near a doubling of an already always-on plume.
    expect(Number(peak![1])).toBeLessThan(1);
  });
});
