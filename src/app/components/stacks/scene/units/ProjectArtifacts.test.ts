import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { PROJECT_ICON_BODY } from "./ProjectArtifacts";
import { PROJECT_ARTIFACT_DIMENSIONS } from "./unitShelfLayout";

const source = fs.readFileSync(
  new URL("./ProjectArtifacts.tsx", import.meta.url),
  "utf8",
);

describe("Projects shelf artifacts", () => {
  it("builds each die as its own movable Liar's Dice Portal", () => {
    const start = source.indexOf("export function DicePyramid");
    const pyramid = source.slice(start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(pyramid).toContain("PROJECT_DICE_LAYOUT.map");
    expect(pyramid).toContain("<Grabbable");
    expect(pyramid).toContain('to="liarsdice"');
    expect(pyramid).toContain("key={die.id}");
  });

  it("uses the shared metal shimmer on full-color icon faces", () => {
    expect(source).toContain("useMetalShimmer");
    // The artwork is the slab's own front-cap material (projectIconSlab.ts),
    // not a plane floating in front of a RoundedBox.
    expect(source).toContain("map: artworkTexture");
    expect(source).toContain("clearcoat: 0.82");
    expect(source).toContain(
      "[artworkMaterial, artworkMaterial, backMaterial]",
    );
    expect(source).toContain("createProjectIconSlabGeometry");
    expect(source).toContain("material={materials}");
  });

  it("keeps the Project Icons near twice the About Apple mark's height", () => {
    expect(PROJECT_ARTIFACT_DIMENSIONS.icon).toBeGreaterThanOrEqual(0.3);
    expect(PROJECT_ARTIFACT_DIMENSIONS.icon).toBeLessThanOrEqual(0.36);
  });

  it("keeps both rounded icon extrusions physically valid", () => {
    expect(PROJECT_ICON_BODY.depth).toBeGreaterThan(
      PROJECT_ICON_BODY.edgeRadius * 2,
    );
    expect(PROJECT_ICON_BODY.fallbackFaceDepth).toBeGreaterThan(
      PROJECT_ICON_BODY.fallbackFaceRadius * 2,
    );
  });
});
