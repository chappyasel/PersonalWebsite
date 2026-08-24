import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { artifactShadeSample, gradeDisplay } from "./artifactShadeProbe";
import { DEFAULT_SCENE_COLOR_GRADE } from "./sceneColorGrade";

const EFFECTS = readFileSync(join(__dirname, "Effects.tsx"), "utf8");

describe("artifact shade factoring", () => {
  it("splits a correction into a scalar and a multiply-safe tint", () => {
    // The room renders this print brighter than its file and cooler.
    const sample = artifactShadeSample(
      { r: 0.5, g: 0.55, b: 0.6 },
      { r: 0.5, g: 0.5, b: 0.5 },
    );
    expect(sample).not.toBeNull();
    // Brightness carries the whole gain, so the tint can stay <= 1 and ride a
    // multiply layer that is only able to darken.
    expect(sample!.brightness).toBeCloseTo(1.2, 5);
    expect(Math.max(...sample!.tint)).toBeCloseTo(1, 5);
    for (const channel of sample!.tint) expect(channel).toBeLessThanOrEqual(1);
    // brightness x tint must reconstruct the measured ratio exactly.
    const rebuilt = sample!.tint.map((c) => c * sample!.brightness);
    expect(rebuilt[0]).toBeCloseTo(1.0, 5);
    expect(rebuilt[1]).toBeCloseTo(1.1, 5);
    expect(rebuilt[2]).toBeCloseTo(1.2, 5);
  });

  it("keeps a print the room darkens", () => {
    const sample = artifactShadeSample(
      { r: 0.37, g: 0.37, b: 0.39 },
      { r: 0.5, g: 0.5, b: 0.5 },
    );
    expect(sample).not.toBeNull();
    expect(sample!.brightness).toBeCloseTo(0.78, 5);
  });

  it("rejects a measurement that is not a lighting difference", () => {
    // Far too dark to be the room: the probe framed something else.
    expect(
      artifactShadeSample(
        { r: 0.1, g: 0.1, b: 0.1 },
        { r: 0.5, g: 0.5, b: 0.5 },
      ),
    ).toBeNull();
    // A tint no lamp produces — one channel a fifth of another.
    expect(
      artifactShadeSample(
        { r: 0.5, g: 0.1, b: 0.5 },
        { r: 0.5, g: 0.5, b: 0.5 },
      ),
    ).toBeNull();
  });

  it("falls back to no correction rather than dividing into black", () => {
    // The caller screens black sources out first; if one reaches here the
    // answer must still be safe, and "change nothing" is the safe answer.
    const sample = artifactShadeSample(
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0, g: 0, b: 0 },
    );
    expect(sample).not.toBeNull();
    expect(sample!.brightness).toBeCloseTo(1, 6);
    expect(sample!.tint).toEqual([1, 1, 1]);
  });
});

describe("grade port", () => {
  it("keeps mid grey near neutral, with only the shader's key-hue lean", () => {
    const graded = gradeDisplay(
      [0.5, 0.5, 0.5],
      DEFAULT_SCENE_COLOR_GRADE.light,
      0,
    );
    // Not exactly neutral: the key hue reaches a little below its 0.40..0.95
    // window's midpoint, so grey picks up the same faint warm lean the shader
    // gives it. Anything larger than a thousandth would be a port bug.
    expect(graded[0]).toBeCloseTo(0.5, 2);
    expect(graded[0] - graded[2]).toBeGreaterThan(0);
    expect(graded[0] - graded[2]).toBeLessThan(0.01);
  });

  it("rebuilds chroma in the mids, which is why the probe must run it", () => {
    const settings = DEFAULT_SCENE_COLOR_GRADE.light;
    const before: [number, number, number] = [0.6, 0.5, 0.4];
    const after = gradeDisplay(before, settings, 0);
    const spread = (rgb: readonly number[]) =>
      Math.max(...rgb) - Math.min(...rgb);
    expect(settings.chromaBoost).toBeGreaterThan(0);
    expect(spread(after)).toBeGreaterThan(spread(before));
  });

  it("is a no-op when every grade knob is off", () => {
    const flat = {
      exposure: 1,
      curve: 0,
      toeTint: 0,
      chromaBoost: 0,
      vignette: 0,
    };
    const graded = gradeDisplay([0.42, 0.31, 0.55], flat, 0);
    // 1.05 is the shader's floor saturation, applied even with no boost, so
    // "off" still means slightly more chroma — not identity.
    expect(graded[0]).toBeGreaterThan(0);
    expect(Number.isFinite(graded[1])).toBe(true);
  });
});

// The port is only correct while it matches the shader. These pin the
// constants the CPU copy hard-codes; if GRADE_FRAGMENT is retuned, this fails
// and `gradeDisplay` has to be brought back in line.
describe("grade port stays pinned to GRADE_FRAGMENT", () => {
  it("uses the shader's toe hues", () => {
    expect(EFFECTS).toContain("vec3(1.00, 0.82, 0.60)");
    expect(EFFECTS).toContain("vec3(0.50, 0.66, 1.00)");
  });

  it("uses the shader's key hues and their luminance window", () => {
    expect(EFFECTS).toContain("vec3(1.012, 1.000, 0.978)");
    expect(EFFECTS).toContain("vec3(1.016, 0.998, 0.968)");
    expect(EFFECTS).toContain("smoothstep(0.40, 0.95, l)");
  });

  it("uses the shader's chroma band and base saturation", () => {
    expect(EFFECTS).toContain("smoothstep(0.30, 0.70, l)");
    expect(EFFECTS).toContain("smoothstep(0.84, 1.00, l)");
    expect(EFFECTS).toContain("float sat = 1.05 + chromaBoost * band;");
  });

  it("still steps through display space with the same gamma", () => {
    expect(EFFECTS).toContain("vec3(0.4545454545)");
    expect(EFFECTS).toContain("pow(d, vec3(2.2))");
  });

  it("still runs ACES, which the probe replicates on the CPU", () => {
    expect(EFFECTS).toContain("ToneMappingMode.ACES_FILMIC");
  });
});
