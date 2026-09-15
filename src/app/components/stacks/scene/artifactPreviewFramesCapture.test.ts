import hotspots from "../illustration/artwork/hotspots.generated.json";
import { SCENE_ARTIFACTS, sceneArtifactByArtworkId } from "../sceneArtifacts";
import { describe, expect, it } from "vitest";

import { artifactPreviewFrameFor } from "./artifactPreviewFrames";
import captured from "./artifactPreviewFrames.generated.json";

type CapturedGeometry = { parts: { id: string }[] };

const DRAWN = new Set(
  Object.values(hotspots as Record<string, CapturedGeometry>).flatMap(
    (capture) => capture.parts.map((part) => part.id),
  ),
);

describe("the captured artifact preview frames", () => {
  it("frames every print the 2D illustration can open", () => {
    // Without a capture these all fall back to BARE_ARTIFACT_PREVIEW_FRAME,
    // which is what "the images are missing their frames" looked like. The
    // registry is empty in 2D because a frame is published by the scene
    // component that draws the photo, and none of those mount there.
    const bare = [...DRAWN]
      .map((id) => sceneArtifactByArtworkId(id))
      .filter((artifact) => artifact && !artifactPreviewFrameFor(artifact.id));
    expect(bare).toEqual([]);
  });

  it("captures nothing the artifact catalog does not know", () => {
    // A stale id here would seed the registry with a frame for a photo that
    // no longer exists, and nothing would ever overwrite it.
    const known = new Set<string>(
      SCENE_ARTIFACTS.map((artifact) => artifact.id),
    );
    const orphans = Object.keys(captured).filter((id) => !known.has(id));
    expect(orphans).toEqual([]);
  });

  it("carries the shape the preview actually reads", () => {
    for (const [id, frame] of Object.entries(captured)) {
      expect(frame.image.width, id).toBeGreaterThan(0);
      expect(frame.image.height, id).toBeGreaterThan(0);
      expect(frame.layers.length, id).toBeGreaterThan(0);
    }
  });
});
