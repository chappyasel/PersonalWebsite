import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_CAROUSEL_DURATION_MS,
  ARTIFACT_CAROUSEL_EASING,
  ARTIFACT_PREVIEW_CROSSFADE_END,
  ARTIFACT_PREVIEW_CROSSFADE_START,
  ARTIFACT_PREVIEW_DOM_IN_END,
  ARTIFACT_PREVIEW_DOM_IN_START,
  ARTIFACT_PREVIEW_DOM_OUT_END,
  ARTIFACT_PREVIEW_DOM_OUT_START,
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
  ARTIFACT_PREVIEW_SOURCE_IN_END,
  ARTIFACT_PREVIEW_SOURCE_OUT_END,
  ARTIFACT_PREVIEW_SOURCE_OUT_START,
  artifactPreviewCrossfade,
  artifactPreviewDuration,
  artifactPreviewEase,
  artifactPreviewEasing,
  artifactPreviewRamp,
} from "./artifactPreviewMotion";

describe("artifact preview motion", () => {
  it("uses one timing contract for the DOM and physical handoffs", () => {
    expect(ARTIFACT_PREVIEW_DURATION_MS).toBe(360);
    expect(ARTIFACT_PREVIEW_EASING).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(artifactPreviewEase(0)).toBe(0);
    expect(artifactPreviewEase(1)).toBe(1);
    expect(artifactPreviewEase(0.25)).toBeCloseTo(0.826, 3);
    expect(artifactPreviewEase(0.5)).toBeCloseTo(0.972, 3);
  });

  it("gives arrow navigation a visible horizontal transition", () => {
    expect(ARTIFACT_CAROUSEL_DURATION_MS).toBe(520);
    expect(ARTIFACT_CAROUSEL_EASING).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
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

  it("staggers the image handoff so one layer is always fully opaque", () => {
    // The DOM print must be solid before the physical print starts to leave;
    // otherwise the swap dips below full coverage and reads as a flicker.
    expect(ARTIFACT_PREVIEW_DOM_IN_START).toBeLessThan(
      ARTIFACT_PREVIEW_DOM_IN_END,
    );
    expect(ARTIFACT_PREVIEW_DOM_IN_END).toBeLessThanOrEqual(
      ARTIFACT_PREVIEW_SOURCE_OUT_START,
    );
    expect(ARTIFACT_PREVIEW_SOURCE_OUT_START).toBeLessThan(
      ARTIFACT_PREVIEW_SOURCE_OUT_END,
    );
    expect(ARTIFACT_PREVIEW_SOURCE_OUT_END).toBeLessThanOrEqual(1);

    expect(artifactPreviewRamp(0.5, 0.3, 0.7)).toBeCloseTo(0.5);
    expect(artifactPreviewRamp(-1, 0.3, 0.7)).toBe(0);
    expect(artifactPreviewRamp(2, 0.3, 0.7)).toBe(1);
  });

  it("mirrors the CSS keyframes onto the stagger windows", () => {
    // globals.css writes the DOM windows as keyframe percentages; they must
    // track these constants or the two layers drift apart.
    const styles = fs.readFileSync(
      new URL("../../../../styles/globals.css", import.meta.url),
      "utf8",
    );
    const fadeIn =
      /@keyframes stacks-artifact-preview-fade-in\s*\{\s*from,\s*(\d+)%\s*\{\s*opacity: 0;\s*\}\s*(\d+)%,/m.exec(
        styles,
      );
    expect(fadeIn?.[1]).toBe(String(ARTIFACT_PREVIEW_DOM_IN_START * 100));
    expect(fadeIn?.[2]).toBe(String(ARTIFACT_PREVIEW_DOM_IN_END * 100));
    // The close is NOT the open mirrored. Only the physical print can
    // rotate; the clone can only scale, so the clone leaves early and the
    // room plays the rest.
    const fadeOut =
      /@keyframes stacks-artifact-preview-fade-out\s*\{\s*from,\s*(\d+)%\s*\{\s*opacity: 1;\s*\}\s*(\d+)%,/m.exec(
        styles,
      );
    expect(fadeOut?.[1]).toBe(String(ARTIFACT_PREVIEW_DOM_OUT_START * 100));
    expect(fadeOut?.[2]).toBe(String(ARTIFACT_PREVIEW_DOM_OUT_END * 100));
  });

  it("gives the close back to the room before the clone leaves", () => {
    // The physical print must be solid BEFORE the clone starts fading, or the
    // swap dips through a gap; and the clone must be gone early enough that
    // the visitor watches the real print rotate rather than a flat scale.
    expect(ARTIFACT_PREVIEW_SOURCE_IN_END).toBeLessThan(
      ARTIFACT_PREVIEW_DOM_OUT_START,
    );
    expect(ARTIFACT_PREVIEW_DOM_OUT_START).toBeLessThan(
      ARTIFACT_PREVIEW_DOM_OUT_END,
    );
    // Most of the close belongs to the room.
    expect(ARTIFACT_PREVIEW_DOM_OUT_END).toBeLessThan(0.35);
  });
});
