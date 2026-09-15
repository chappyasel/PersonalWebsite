import { type SceneArtifactId, sceneArtifactById } from "../sceneArtifacts";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ABOUT_LANDMARK_ARTIFACTS } from "./aboutBootComposition";

const unitAbout = readFileSync(
  new URL("./units/UnitAbout.tsx", import.meta.url),
  "utf8",
);

describe("the About landmark to artifact bridge", () => {
  it("names artifacts the catalog knows", () => {
    for (const [landmark, artifact] of Object.entries(ABOUT_LANDMARK_ARTIFACTS))
      expect(
        sceneArtifactById(artifact as SceneArtifactId),
        landmark,
      ).not.toBeNull();
  });

  it("agrees with the pairing UnitAbout actually renders", () => {
    // The room is the source of truth: a photo's Grabbable carries the
    // artifact id and its group carries the landmark node name, a few lines
    // apart. 2D cannot import that module without pulling three onto the
    // homepage's initial graph, so it reads the source instead of trusting
    // a second copy of the association to stay correct on its own.
    for (const [landmark, artifact] of Object.entries(
      ABOUT_LANDMARK_ARTIFACTS,
    )) {
      const at = unitAbout.indexOf(`id="${artifact}"`);
      expect(at, `${artifact} is not rendered in UnitAbout`).toBeGreaterThan(
        -1,
      );
      const block = unitAbout.slice(at, at + 1200);
      expect(block, `${artifact} is not paired with ${landmark}`).toContain(
        `aboutLandmarkNodeName("${landmark}")`,
      );
    }
  });
});
