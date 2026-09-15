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

describe("meadow brush settles to exactly zero", () => {
  it("snaps a decayed brush strength to zero at the idle epsilon", () => {
    expect(meadowSettledBrushStrength(MEADOW_BRUSH_IDLE_EPSILON / 2)).toBe(0);
    expect(meadowSettledBrushStrength(1e-12)).toBe(0);
    expect(Object.is(meadowSettledBrushStrength(0), 0)).toBe(true);
    // Anything a visitor can see passes through untouched.
    expect(meadowSettledBrushStrength(MEADOW_POKE.hoverStrength)).toBe(
      MEADOW_POKE.hoverStrength,
    );
    expect(meadowSettledBrushStrength(MEADOW_BRUSH_IDLE_EPSILON)).toBe(
      MEADOW_BRUSH_IDLE_EPSILON,
    );
  });

  it("closes the gate within a second of a released gesture", () => {
    // THREE.MathUtils.damp toward zero, at the authored grass release rate.
    let strength: number = MEADOW_POKE.hoverStrength;
    const delta = 1 / 120;
    let frames = 0;
    while (strength > 0 && frames < 10_000) {
      strength *= Math.exp(-MEADOW_POKE.grassReleaseLambda * delta);
      strength = meadowSettledBrushStrength(strength);
      frames += 1;
    }
    expect(strength).toBe(0);
    expect(frames / 120).toBeLessThan(2);
    // Without the snap the same decay is still nonzero after a full minute,
    // which is the whole reason the snap exists.
    let bare: number = MEADOW_POKE.hoverStrength;
    for (let i = 0; i < 120 * 60; i += 1)
      bare *= Math.exp(-MEADOW_POKE.grassReleaseLambda * delta);
    expect(bare).toBeGreaterThan(0);
  });

  it("keeps the snap far below one authored lean unit", () => {
    // The brush contributes at most `strength` to a lean the shader clamps at
    // authoredMaxLean, so the worst displacement the snap removes is the
    // epsilon itself against that clamp.
    expect(MEADOW_BRUSH_IDLE_EPSILON / MEADOW_WIND.authoredMaxLean).toBeLessThan(
      0.005,
    );
  });

  it("reports rest only when no pulse slot and no brush carries strength", () => {
    expect(meadowBrushAtRest(0, [0, 0, 0, 0, 0, 0])).toBe(true);
    expect(meadowBrushAtRest(0.2, [0, 0, 0, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [0, 0, 0.01, 0, 0, 0])).toBe(false);
    expect(meadowBrushAtRest(0, [])).toBe(true);
  });

  it("agrees with the frame loop's own running test", () => {
    // Meadow.tsx decides whether a touch gesture is still animating from the
    // same threshold the vertex guard uses. If these drift, a gesture can be
    // declared finished while the shader still pays for it, or the reverse.
    expect(meadow).toContain("uPoke.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("uPokeF.value.w > MEADOW_BRUSH_IDLE_EPSILON");
    expect(meadow).toContain("shared.uPulseActive.value =");
    expect(meadow).toContain(
      "shared.uPoke.value.w = meadowSettledBrushStrength(",
    );
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
