import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("transition color stability", () => {
  it("does not recolor the DOM photo while it is moving", () => {
    expect(GLOBALS).not.toContain("stacks-artifact-preview-shade-out");
    expect(GLOBALS).not.toContain("stacks-artifact-preview-shade-in");
    expect(GLOBALS).not.toContain("stacks-artifact-preview-photo-shade");
    expect(GLOBALS).not.toContain("--stacks-preview-shade-filter");
    expect(artifactPreviewShadeFilter({ tint: "", brightness: 1 })).toBe(
      "brightness(1.0000)",
    );
  });
});
