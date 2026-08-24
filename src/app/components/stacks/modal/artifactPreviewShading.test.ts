import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_PREVIEW_DOM_IN_END,
  ARTIFACT_PREVIEW_DOM_IN_START,
  ARTIFACT_PREVIEW_DOM_OUT_START,
} from "./artifactPreviewMotion";
import {
  ARTIFACT_PREVIEW_SHADE,
  artifactPreviewShade,
  artifactPreviewShadeFilter,
} from "./artifactPreviewShading";

const GLOBALS = readFileSync(
  join(__dirname, "..", "..", "..", "..", "styles", "globals.css"),
  "utf8",
);

describe("preview shade resolution", () => {
  it("uses the print's own measurement when there is one", () => {
    const shade = artifactPreviewShade(
      { brightness: 1.0727, tint: [0.929, 0.988, 1] },
      false,
    );
    expect(shade.tint).toBe("rgb(237, 252, 255)");
    // Above 1: the room renders this print BRIGHTER than its file. A multiply
    // layer cannot express that, which is why brightness is a filter.
    expect(shade.brightness).toBeCloseTo(1.0727, 4);
    expect(artifactPreviewShadeFilter(shade)).toBe("brightness(1.0727)");
  });

  it("falls back to the per-theme constant, in the same factored form", () => {
    for (const dark of [false, true]) {
      const shade = artifactPreviewShade(undefined, dark);
      // The brightest channel of the constant becomes the scalar, so the tint
      // it leaves behind is multiply-safe.
      const channels = /rgb\((\d+), (\d+), (\d+)\)/
        .exec(ARTIFACT_PREVIEW_SHADE[dark ? "dark" : "light"])!
        .slice(1)
        .map((value) => Number(value) / 255);
      expect(shade.brightness).toBeCloseTo(Math.max(...channels), 4);
      const tint = /rgb\((\d+), (\d+), (\d+)\)/.exec(shade.tint)!;
      for (let channel = 1; channel <= 3; channel += 1)
        expect(Number(tint[channel])).toBeLessThanOrEqual(255);
      expect(Math.max(...[1, 2, 3].map((i) => Number(tint[i])))).toBe(255);
    }
  });

  it("reconstructs the constant it was factored from", () => {
    const shade = artifactPreviewShade(undefined, false);
    const tint = /rgb\((\d+), (\d+), (\d+)\)/.exec(shade.tint)!;
    const rebuilt = [1, 2, 3].map((i) =>
      Math.round(Number(tint[i]) * shade.brightness),
    );
    expect(rebuilt).toEqual([197, 197, 201]);
  });
});

describe("the CSS that releases the shade", () => {
  it("drives the filter from the per-print custom property", () => {
    expect(GLOBALS).toContain(
      "filter: var(--stacks-preview-shade-filter, brightness(1));",
    );
  });

  it("keeps the same function list in both states so it interpolates", () => {
    // A transition between `none` and `brightness(x)` snaps; between
    // `brightness(1)` and `brightness(x)` it eases.
    expect(GLOBALS).toContain("filter: brightness(1);");
    expect(artifactPreviewShadeFilter({ tint: "", brightness: 1 })).toBe(
      "brightness(1.0000)",
    );
  });

  it("releases the tint and the filter together, INSIDE the morph", () => {
    // Both halves of the correction must ride the same 360ms clock and reach
    // true colour on the same keyframes. Releasing after the motion has
    // stopped is what made a near-white chart sit pink and then turn white.
    for (const keyframes of [
      "stacks-artifact-preview-shade-out",
      "stacks-artifact-preview-photo-shade-out",
    ]) {
      const block = new RegExp(
        `@keyframes ${keyframes}\\s*\\{\\s*from,\\s*(\\d+)%[^}]*\\}\\s*(\\d+)%,`,
        "m",
      ).exec(GLOBALS);
      expect(block?.[1]).toBe("40");
      expect(block?.[2]).toBe("80");
    }
    expect(GLOBALS).toContain(
      "animation: stacks-artifact-preview-shade-out 360ms linear both;",
    );
    expect(GLOBALS).toContain(
      "animation: stacks-artifact-preview-photo-shade-out 360ms linear both;",
    );
  });

  it("holds through the swap and clears before the image settles", () => {
    // 40% still covers the 48-62% handoff, which is the only moment the tint
    // is actually FOR; 80% is before `opening` drops, so the attribute
    // leaving can never snap a half-released shade to true colour.
    expect(0.4).toBeLessThan(ARTIFACT_PREVIEW_DOM_IN_START);
    expect(0.8).toBeGreaterThan(ARTIFACT_PREVIEW_DOM_IN_END);
  });

  it("re-acquires the room's light before the clone dissolves on close", () => {
    // The clone leaves at 10-24% of the close, so the tint has to be back by
    // 8% or a white page flashes over a warm-lit print on the way out.
    expect(GLOBALS).toContain(
      "animation: stacks-artifact-preview-shade-in 360ms linear both;",
    );
    expect(0.08).toBeLessThan(ARTIFACT_PREVIEW_DOM_OUT_START);
  });
});
