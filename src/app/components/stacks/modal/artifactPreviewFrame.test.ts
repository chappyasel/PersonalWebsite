import { describe, expect, it } from "vitest";

import {
  type ArtifactPreviewFrame,
  BARE_ARTIFACT_PREVIEW_FRAME,
  artifactPreviewFrameLayout,
  artifactPreviewFrameOuterInset,
  framedArtifactPreviewSize,
  resolveArtifactPreviewFrameTone,
} from "./artifactPreviewFrame";

/** A DeskFrame shape: 0.264-wide plane, 6 mm mat inside a 24 mm frame. */
const DESK_FRAME: ArtifactPreviewFrame = {
  image: { width: 0.264, height: 0.198 },
  layers: [
    { inset: 0.006, tone: "pages", radius: 0 },
    { inset: 0.024, tone: "frame", radius: 0.005 },
  ],
};

const ORNATE_FRAME: ArtifactPreviewFrame = {
  image: { width: 0.66, height: 0.4125 },
  layers: [
    { inset: 0.016, tone: "pages", radius: 0 },
    { inset: 0.048, tone: "#b0913f", radius: 0.006, finish: "gilt" },
    { inset: 0.058, tone: "#7d6429", radius: 0.006, finish: "gilt" },
  ],
  accents: [
    {
      kind: "corner-blocks",
      tone: "#b0913f",
      size: 0.034,
      edgeInset: 0.017,
      radius: 0.004,
    },
  ],
};

describe("artifact preview frame geometry", () => {
  it("measures the framed print, scaling scene borders through the image width", () => {
    // 0.024 scene units on a 0.264-wide plane showing a 1056px image is
    // 96px a side: the border-to-photo proportion the shelf has.
    expect(
      framedArtifactPreviewSize(DESK_FRAME, { width: 1056, height: 792 }),
    ).toEqual({ width: 1248, height: 984 });
  });

  it("leaves a bare artifact's size alone", () => {
    expect(artifactPreviewFrameOuterInset(BARE_ARTIFACT_PREVIEW_FRAME)).toBe(0);
    expect(
      framedArtifactPreviewSize(BARE_ARTIFACT_PREVIEW_FRAME, {
        width: 640,
        height: 480,
      }),
    ).toEqual({ width: 640, height: 480 });
  });

  it("lays layers out outer to inner from the framed box's width", () => {
    // Framed box 624px wide -> 2px per mm of scene border.
    const layout = artifactPreviewFrameLayout(DESK_FRAME, 624);
    expect(layout.imageInset).toBeCloseTo(48, 6);
    expect(layout.radius).toBeCloseTo(10, 6);
    expect(layout.layers).toHaveLength(2);
    expect(layout.layers[0]).toMatchObject({ tone: "frame" });
    expect(layout.layers[0]!.offset).toBeCloseTo(0, 6);
    expect(layout.layers[0]!.radius).toBeCloseTo(10, 6);
    expect(layout.layers[1]).toMatchObject({ tone: "pages" });
    expect(layout.layers[1]!.offset).toBeCloseTo(36, 6);
  });

  it("has no edges to lay out for a bare artifact", () => {
    const layout = artifactPreviewFrameLayout(BARE_ARTIFACT_PREVIEW_FRAME, 624);
    expect(layout).toEqual({
      imageInset: 0,
      radius: 0,
      layers: [],
      accents: [],
    });
  });

  it("resolves palette tones and passes literal colours through", () => {
    const palette = { paper: "#f6efdf", pages: "#f4ecdb", frame: "#e6d9c0" };
    expect(resolveArtifactPreviewFrameTone("paper", palette)).toBe("#f6efdf");
    expect(resolveArtifactPreviewFrameTone("frame", palette)).toBe("#e6d9c0");
    expect(resolveArtifactPreviewFrameTone("#d7cdbb", palette)).toBe("#d7cdbb");
  });

  it("scales physical frame accents with the edge layers", () => {
    const layout = artifactPreviewFrameLayout(ORNATE_FRAME, 776);
    expect(layout.layers.map((layer) => layer.finish)).toEqual([
      "gilt",
      "gilt",
      undefined,
    ]);
    expect(layout.accents).toEqual([
      {
        kind: "corner-blocks",
        tone: "#b0913f",
        size: 34,
        edgeInset: 17,
        radius: 4,
      },
    ]);
  });
});
