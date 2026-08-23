import { describe, expect, it } from "vitest";

import {
  ARTIFACT_CAROUSEL_DURATION_MS,
  ARTIFACT_CAROUSEL_EASING,
  ARTIFACT_PREVIEW_CROSSFADE_END,
  ARTIFACT_PREVIEW_CROSSFADE_START,
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
  artifactPreviewCrossfade,
  artifactPreviewDuration,
  artifactPreviewEase,
  artifactPreviewEasing,
} from "./artifactPreviewMotion";

describe("artifact preview motion", () => {
  it("uses one timing contract for the DOM and physical handoffs", () => {
    expect(ARTIFACT_PREVIEW_DURATION_MS).toBe(360);
    expect(ARTIFACT_PREVIEW_EASING).toBe(
      "cubic-bezier(0.16, 1, 0.3, 1)",
    );
    expect(artifactPreviewEase(0)).toBe(0);
    expect(artifactPreviewEase(1)).toBe(1);
    expect(artifactPreviewEase(0.25)).toBeCloseTo(0.826, 3);
    expect(artifactPreviewEase(0.5)).toBeCloseTo(0.972, 3);
  });

  it("gives arrow navigation a visible horizontal transition", () => {
    expect(ARTIFACT_CAROUSEL_DURATION_MS).toBe(520);
    expect(ARTIFACT_CAROUSEL_EASING).toBe(
      "cubic-bezier(0.4, 0, 0.2, 1)",
    );
    expect(artifactPreviewDuration(3)).toBe(520);
    expect(artifactPreviewEasing(3)).toBe(ARTIFACT_CAROUSEL_EASING);
    expect(artifactPreviewDuration(1)).toBe(ARTIFACT_PREVIEW_DURATION_MS);
    expect(artifactPreviewEasing(2)).toBe(ARTIFACT_PREVIEW_EASING);
  });

  it("keeps both ends solid and crossfades only from 30 to 70 percent", () => {
    expect(ARTIFACT_PREVIEW_CROSSFADE_START).toBe(0.3);
    expect(ARTIFACT_PREVIEW_CROSSFADE_END).toBe(0.7);
    const samples = [0, 0.29, 0.3, 0.5, 0.7, 0.71, 1].map(
      artifactPreviewCrossfade,
    );
    [0, 0, 0, 0.5, 1, 1, 1].forEach((expected, index) =>
      expect(samples[index]).toBeCloseTo(expected),
    );
  });
});
