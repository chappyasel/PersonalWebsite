import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_CAROUSEL_DURATION_MS,
  ARTIFACT_CAROUSEL_EASING,
  ARTIFACT_PREVIEW_CROSSFADE_END,
  ARTIFACT_PREVIEW_CROSSFADE_START,
  ARTIFACT_PREVIEW_DETAIL_IN_START,
  ARTIFACT_PREVIEW_DETAIL_OUT_START,
  ARTIFACT_PREVIEW_DOM_IN_END,
  ARTIFACT_PREVIEW_DOM_IN_START,
  ARTIFACT_PREVIEW_DOM_OUT_END,
  ARTIFACT_PREVIEW_DOM_OUT_START,
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
  ARTIFACT_PREVIEW_SOURCE_IN_END,
  ARTIFACT_PREVIEW_SOURCE_IN_START,
  ARTIFACT_PREVIEW_SOURCE_OUT_END,
  ARTIFACT_PREVIEW_SOURCE_OUT_START,
  artifactPreviewCrossfade,
  artifactPreviewDuration,
  artifactPreviewEase,
  artifactPreviewEasing,
  artifactPreviewPhysicalTravel,
  artifactPreviewRamp,
} from "./artifactPreviewMotion";

describe("artifact preview motion", () => {
  it("uses one timing contract for the DOM and physical handoffs", () => {
    expect(ARTIFACT_PREVIEW_DURATION_MS).toBe(420);
    expect(ARTIFACT_PREVIEW_EASING).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(artifactPreviewEase(0)).toBe(0);
    expect(artifactPreviewEase(1)).toBe(1);
    expect(artifactPreviewEase(0.25)).toBeCloseTo(0.237, 3);
    expect(artifactPreviewEase(0.5)).toBeCloseTo(0.776, 3);
    // At 30 fps the first captured interval must not consume a visible chunk
    // of the flight. The old ease-out covered 55% here and looked like a cut.
    expect(
      artifactPreviewEase(1000 / 30 / ARTIFACT_PREVIEW_DURATION_MS),
    ).toBeLessThan(0.05);
  });

  it("gives arrow navigation a visible horizontal transition", () => {
    expect(ARTIFACT_CAROUSEL_DURATION_MS).toBe(520);
    expect(ARTIFACT_CAROUSEL_EASING).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(artifactPreviewDuration(3)).toBe(520);
    expect(artifactPreviewEasing(3)).toBe(ARTIFACT_CAROUSEL_EASING);
    expect(artifactPreviewDuration(1)).toBe(ARTIFACT_PREVIEW_DURATION_MS);
    expect(artifactPreviewEasing(2)).toBe(ARTIFACT_PREVIEW_EASING);
  });

  it("hands the visible flight to the DOM near the captured origin", () => {
    expect(ARTIFACT_PREVIEW_CROSSFADE_START).toBe(0.02);
    expect(ARTIFACT_PREVIEW_CROSSFADE_END).toBe(0.12);
    const samples = [0, 0.01, 0.02, 0.07, 0.12, 0.13, 1].map(
      artifactPreviewCrossfade,
    );
    [0, 0, 0, 0.5, 1, 1, 1].forEach((expected, index) =>
      expect(samples[index]).toBeCloseTo(expected),
    );
  });

  it("retires the physical source only after the DOM copy covers it", () => {
    expect(ARTIFACT_PREVIEW_DOM_IN_START).toBe(0.3);
    expect(ARTIFACT_PREVIEW_DOM_IN_END).toBe(0.46);
    expect(ARTIFACT_PREVIEW_SOURCE_OUT_START).toBe(ARTIFACT_PREVIEW_DOM_IN_END);
    expect(ARTIFACT_PREVIEW_SOURCE_OUT_START).toBeLessThan(
      ARTIFACT_PREVIEW_SOURCE_OUT_END,
    );
    expect(ARTIFACT_PREVIEW_SOURCE_OUT_END).toBe(0.58);

    expect(artifactPreviewRamp(0.5, 0.3, 0.7)).toBeCloseTo(0.5);
    expect(artifactPreviewRamp(-1, 0.3, 0.7)).toBe(0);
    expect(artifactPreviewRamp(2, 0.3, 0.7)).toBe(1);
  });

  it("crossfades over an opaque physical source without a transparent gap", () => {
    const styles = fs.readFileSync(
      new URL("../../../../styles/globals.css", import.meta.url),
      "utf8",
    );
    expect(styles).toContain("@keyframes stacks-artifact-preview-cover-in");
    expect(styles).toContain("30% {");
    expect(styles).toContain("46%,");
    expect(ARTIFACT_PREVIEW_SOURCE_IN_START).toBe(0.42);
    expect(ARTIFACT_PREVIEW_SOURCE_IN_END).toBe(0.54);
    expect(ARTIFACT_PREVIEW_DOM_OUT_START).toBe(ARTIFACT_PREVIEW_SOURCE_IN_END);
    expect(ARTIFACT_PREVIEW_DOM_OUT_END).toBe(0.7);
    expect(styles).toContain("@keyframes stacks-artifact-preview-cover-out");
    expect(styles).toContain("54% {");
    expect(styles).toContain("70%,");
  });

  it("keeps both geometry solvers on the same motion clock", () => {
    expect(artifactPreviewPhysicalTravel(0, false)).toBe(0);
    expect(artifactPreviewPhysicalTravel(0.5, false)).toBe(0.5);
    expect(artifactPreviewPhysicalTravel(1, false)).toBe(1);
    expect(artifactPreviewPhysicalTravel(0.5, true)).toBe(0.5);
  });

  it("places the resolution swap in the middle of each flight", () => {
    expect(ARTIFACT_PREVIEW_DETAIL_IN_START).toBe(0.42);
    expect(ARTIFACT_PREVIEW_DETAIL_OUT_START).toBe(0.32);
    expect(ARTIFACT_PREVIEW_DETAIL_IN_START).toBeGreaterThan(0.3);
    expect(ARTIFACT_PREVIEW_DETAIL_IN_START).toBeLessThan(0.6);
    expect(ARTIFACT_PREVIEW_DETAIL_OUT_START).toBeGreaterThan(0.2);
    expect(ARTIFACT_PREVIEW_DETAIL_OUT_START).toBeLessThan(0.5);
  });
});
