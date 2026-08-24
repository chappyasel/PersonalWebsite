import { afterEach, describe, expect, it } from "vitest";

import type { ArtifactPreviewFrame } from "../modal/artifactPreviewFrame";
import {
  ARTIFACT_PLANE_ASPECT_TOLERANCE,
  artifactPlaneAspectMismatch,
  artifactPreviewFrameFor,
  readArtifactPreviewFrames,
  registerArtifactPreviewFrame,
  resetArtifactPreviewFramesForTests,
} from "./artifactPreviewFrames";

const FLAT_PRINT: ArtifactPreviewFrame = {
  image: { width: 0.3072, height: 0.192 },
  layers: [{ inset: 0.014, tone: "paper", radius: 0.002 }],
};

afterEach(resetArtifactPreviewFramesForTests);

describe("artifact preview frame registry", () => {
  it("registers a form's edges and releases them on unmount", () => {
    const release = registerArtifactPreviewFrame(
      "about-collective-group-v8",
      FLAT_PRINT,
    );
    expect(artifactPreviewFrameFor("about-collective-group-v8")).toBe(
      FLAT_PRINT,
    );
    release();
    expect(artifactPreviewFrameFor("about-collective-group-v8")).toBeNull();
  });

  it("replaces the snapshot map on change so subscribers can compare by identity", () => {
    const before = readArtifactPreviewFrames();
    registerArtifactPreviewFrame("about-collective-group-v8", FLAT_PRINT);
    expect(readArtifactPreviewFrames()).not.toBe(before);
  });

  it("lets a stale release remove only its own registration", () => {
    const stale = registerArtifactPreviewFrame(
      "about-collective-group-v8",
      FLAT_PRINT,
    );
    const replacement: ArtifactPreviewFrame = { ...FLAT_PRINT };
    registerArtifactPreviewFrame("about-collective-group-v8", replacement);
    stale();
    expect(artifactPreviewFrameFor("about-collective-group-v8")).toBe(
      replacement,
    );
  });

  it("measures how far a plane's aspect drifts from its source", () => {
    // 1024x640 source on a matching plane: no drift.
    expect(
      artifactPlaneAspectMismatch("about-collective-group-v8", {
        width: 0.3072,
        height: 0.192,
      })!.relative,
    ).toBeCloseTo(0, 8);
    // The old corkboard portrait cut: 0.5625 plane over a 0.80 photo.
    const cropped = artifactPlaneAspectMismatch("training-trophy-side-v8", {
      width: 0.36,
      height: 0.64,
    })!;
    expect(cropped.relative).toBeGreaterThan(ARTIFACT_PLANE_ASPECT_TOLERANCE);
    expect(
      artifactPlaneAspectMismatch("homework-app", { width: 1, height: 1 }),
    ).toBeNull();
  });
});
