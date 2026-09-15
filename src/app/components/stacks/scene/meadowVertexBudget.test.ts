import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { meadowGrassVertexShader } from "./Meadow";
import {
  MEADOW_BRUSH_IDLE_EPSILON,
  meadowBrushAtRest,
  meadowSettledBrushStrength,
} from "./meadowInteraction";
import { MEADOW_POKE, MEADOW_WIND } from "./meadowMotion";

const meadow = fs.readFileSync(
  path.join(path.resolve(__dirname), "Meadow.tsx"),
  "utf8",
);
/** The GLSL the GPU actually compiles, not the template that produces it. */
const grass = meadowGrassVertexShader(false);
const deformedGrass = meadowGrassVertexShader(true);

// ---------------------------------------------------------------------------
// The CPU half. An eased brush has to land on EXACTLY zero, or the shader's
// uniform guard never closes and the expensive path is the resident one.

/** THREE.MathUtils.damp, reproduced so the settle can be tested against the
 * arithmetic the frame loop actually runs. */
const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt);

/** Drive one brush through `frames` at 120Hz exactly as the frame loop does:
 * damp toward the target at the attack or release rate, then settle. */
function driveBrush({
  target,
  frames,
  attack,
  release,
  from = 0,
}: {
  target: number;
  frames: number;
  attack: number;
  release: number;
  from?: number;
}) {
  const dt = 1 / 120;
  let strength = from;
  for (let i = 0; i < frames; i += 1) {
    strength = damp(
      strength,
      target,
      target > strength ? attack : release,
      dt,
    );
    strength = meadowSettledBrushStrength(strength, target);
  }
  return strength;
}

describe("meadow brush settles to exactly zero without eating a live gesture", () => {
  it("lets a slow drag reach its target instead of being clamped to nothing", () => {
    // A slow pointer drag produces a small target: meadowDragSample scales
    // hoverStrength by (1 - exp(-speed / dragSpeedScale)), so a gentle sweep
    // asks for a few percent of full strength. Each damp step toward it is a
    // fraction of that again, which is how a naive settle on the STATE rather
    // than on the gesture silently deletes the whole input: the ramp never
    // clears the epsilon, so the brush is pinned at zero forever.
    const slow = 0.006; // 3% of hoverStrength
    expect(slow).toBeGreaterThan(MEADOW_BRUSH_IDLE_EPSILON);
    const grass = driveBrush({
      target: slow,
      frames: 240,
      attack: MEADOW_POKE.grassAttackLambda,
      release: MEADOW_POKE.grassReleaseLambda,
    });
    expect(grass).toBeCloseTo(slow, 5);
    // Flowers ease at less than a third of the grass attack rate, so their
    // first steps are smaller still and they fail this first.
    const flowers = driveBrush({
      target: 0.02,
      frames: 480,
      attack: MEADOW_POKE.flowerAttackLambda,
      release: MEADOW_POKE.flowerReleaseLambda,
    });
    expect(flowers).toBeCloseTo(0.02, 5);
  });

  it("never alters a brush while a gesture is driving it", () => {
    // The settle is a property of an UNDRIVEN brush. With any live target the
    // damped value must pass through untouched, however small it is.
    expect(meadowSettledBrushStrength(1e-9, 0.2)).toBe(1e-9);
    expect(meadowSettledBrushStrength(1e-9, 1e-6)).toBe(1e-9);
    expect(meadowSettledBrushStrength(0.5, 0.2)).toBe(0.5);
  });

  it("collapses a released brush to exactly zero within a second", () => {
    const released = driveBrush({
      target: 0,
      frames: 240,
      attack: MEADOW_POKE.grassAttackLambda,
      release: MEADOW_POKE.grassReleaseLambda,
      from: MEADOW_POKE.hoverStrength,
    });
    expect(Object.is(released, 0)).toBe(true);
    // Without the settle the same decay is still nonzero after a full minute,
    // which is the whole reason the settle exists: the shader's uniform guard
    // would never close and the expensive path would be the resident one.
    let bare: number = MEADOW_POKE.hoverStrength;
    for (let i = 0; i < 120 * 60; i += 1)
      bare = damp(bare, 0, MEADOW_POKE.grassReleaseLambda, 1 / 120);
    expect(bare).toBeGreaterThan(0);
  });

  it("keeps the complete collapsed lean far below one authored throw", () => {
    // Both terms, not just the direct one. `uPokeDir * push` is bounded by
    // the epsilon; the wind suppression is bounded by
    // windSuppression * (epsilon / hoverStrength) * the gust ceiling, and it
    // is roughly four times larger. An earlier version of this bound counted
    // only the direct half and understated the settle by that factor.
    const direct = MEADOW_BRUSH_IDLE_EPSILON;
    const suppression =
      MEADOW_POKE.windSuppression *
      (MEADOW_BRUSH_IDLE_EPSILON / MEADOW_POKE.hoverStrength) *
      MEADOW_WIND.gustCeiling;
    expect(suppression).toBeGreaterThan(direct);
    expect((direct + suppression) / MEADOW_WIND.authoredMaxLean).toBeLessThan(
      0.015,
    );
  });

  it("reports rest only when no pulse slot and no brush carries strength", () => {
    expect(meadowBrushAtRest(0, [0, 0, 0, 0, 0, 0])).toBe(true);
    expect(meadowBrushAtRest(0.2, [0, 0, 0, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [0, 0, 0.01, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [])).toBe(true);
  });

  it("settles both brushes against the gesture target the frame loop damped toward", () => {
    expect(meadow).toContain(
      "shared.uPoke.value.w = meadowSettledBrushStrength(\n      shared.uPoke.value.w,\n      brushTarget,\n    );",
    );
    expect(meadow).toContain(
      "shared.uPokeF.value.w = meadowSettledBrushStrength(\n      shared.uPokeF.value.w,\n      brushTarget,\n    );",
    );
    // The target has to be the one the damps actually aimed at, taken after
    // them and inside the pointer block, or the settle is reading a stale or
    // absent gesture and the unit regression above proves nothing about the
    // shipped loop.
    expect(meadow).toContain("let brushTarget = 0;");
    expect(meadow).toMatch(
      /MEADOW_POKE\.flowerReleaseLambda,\s*\n\s*delta,\s*\n\s*\);\s*\n\s*brushTarget = target;/,
    );
    // The frame loop's own "is a gesture still animating" test and the
    // shader's guard have to read the same threshold, or a gesture can be
    // declared finished while the shader still pays for it.
    expect(meadow).toContain("uPoke.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("uPokeF.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("shared.uPulseActive.value =");
  });
});

// ---------------------------------------------------------------------------
// The GPU half. Every guarded term below depends only on `origin`, so it is
// per-INSTANCE work paid per VERTEX — 132 times over for the near tuft LOD.
// The guards are uniform-valued, so a warp never diverges on them.

describe("grass vertex shader skips idle per-instance simulation", () => {
  it("gates the whole pulse ring loop on one live-pulse uniform", () => {
    for (const source of [grass, deformedGrass]) {
      expect(source).toContain("uniform float uPulseActive;");
      expect(source).toContain("if (uPulseActive > 0.0) {");
      expect(source).toContain("if (pulse.w <= 0.0) continue;");
    }
  });

  it("skips the pointer brush shape while no brush is live", () => {
    expect(grass).toContain("if (uPoke.w > 0.0) {");
    expect(deformedGrass).toContain("if (uPoke.w > 0.0) {");
  });

  it("skips a dark lamp slot in the shared analytic pool", () => {
    expect(grass).toContain("if (uLampGlow[i] <= 0.0) continue;");
  });

  it("declares every guarded term before its guard and consumes it after", () => {
    // A guard that leaves a term undeclared is the one way this optimisation
    // can change a pixel. Each interaction term must have a zero default
    // ahead of the branch, and the lean must be assembled outside it.
    const declare = grass.indexOf("float pokeShape = 0.0;");
    const guard = grass.indexOf("if (uPoke.w > 0.0) {");
    const consume = grass.indexOf("vec2 lean = w * (1.0 - 0.82");
    expect(declare).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(declare);
    expect(consume).toBeGreaterThan(guard);
    expect(grass).toContain("float push = 0.0;");
    expect(grass).toContain("float pokeActivity = 0.0;");
    expect(grass).toContain("vec2 pulseLean = vec2(0.0);");
    expect(grass).toContain("float pulseActivity = 0.0;");
    expect(grass).toContain("+ uPokeDir * push");
    expect(grass).toContain("+ pulseLean;");
    expect(grass).toContain(
      "float interactionShape = max(\n      pokeShape * pokeActivity,\n      pulseActivity\n    );",
    );
  });

  it("leaves the far lawn's simplified path alone", () => {
    // FAR_SIMPLE never had an interaction block; guarding must not add one.
    const farBranch = grass.slice(
      grass.indexOf("#ifdef FAR_SIMPLE"),
      grass.indexOf("#else"),
    );
    expect(farBranch).toContain("vec2 lean = w;");
    expect(farBranch).not.toContain("uPulseActive");
  });
});
