import { describe, expect, it } from "vitest";

import {
  artifactPreviewStage,
  fitArtifactPreviewToViewport,
  layoutArtifactPreview,
} from "./artifactPreviewFit";

describe("artifact preview fit", () => {
  it("gives a wide mobile photo horizontal breathing room", () => {
    expect(
      fitArtifactPreviewToViewport(
        { width: 1024, height: 512 },
        { width: 390, height: 844 },
      ),
    ).toEqual({ width: 342, height: 171 });
  });

  it("preserves portrait aspect ratio inside the same safe area", () => {
    expect(
      fitArtifactPreviewToViewport(
        { width: 600, height: 800 },
        { width: 390, height: 844 },
      ),
    ).toEqual({ width: 342, height: 456 });
  });

  it("reserves vertical room for a tall desktop image", () => {
    expect(
      fitArtifactPreviewToViewport(
        { width: 600, height: 1200 },
        { width: 1440, height: 900 },
      ),
    ).toEqual({ width: 378, height: 756 });
  });

  it("does not enlarge an image beyond its source dimensions", () => {
    expect(
      fitArtifactPreviewToViewport(
        { width: 320, height: 180 },
        { width: 1440, height: 900 },
      ),
    ).toEqual({ width: 320, height: 180 });
  });
});

describe("image and caption stage", () => {
  it.each([
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ])(
    "fits a portrait and long caption above the dock at $width x $height",
    (viewport) => {
      const controlsHeight = 124;
      const fitted = layoutArtifactPreview(
        { width: 600, height: 1200 },
        viewport,
        { captionHeight: 200, controlsHeight },
      );
      expect(fitted.top).toBeGreaterThanOrEqual(15);
      expect(fitted.height).toBeGreaterThan(100);
      expect(fitted.width / fitted.height).toBeCloseTo(0.5, 1);
      expect(fitted.captionTop).toBeGreaterThan(fitted.top + fitted.height);
      expect(fitted.captionTop + fitted.captionHeight).toBeLessThanOrEqual(
        viewport.height - controlsHeight - 15,
      );
      expect(
        (viewport.height - fitted.height) / 2 + fitted.offsetY,
      ).toBeCloseTo(fitted.top);
    },
  );

  it("shifts the photo layer by the same amount for every image", () => {
    const viewport = { width: 390, height: 844 };
    const chrome = { captionHeight: 90, controlsHeight: 120 };
    const stage = artifactPreviewStage(viewport, chrome);
    // Half the chrome and the caption gap: the window-centred layer moves
    // up so the image-and-caption block centres between the top edge and
    // the dock.
    expect(stage.offsetY).toBe(-(120 + 90 + 16) / 2);
    expect(stage.captionHeight).toBe(90);
    for (const image of [
      { width: 600, height: 1200 },
      { width: 1200, height: 600 },
      { width: 100, height: 100 },
    ]) {
      const fitted = layoutArtifactPreview(image, viewport, chrome);
      expect(fitted.offsetY).toBe(stage.offsetY);
      expect(fitted.captionTop).toBe(fitted.top + fitted.height + 16);
      expect(fitted.captionTop + fitted.captionHeight).toBeLessThanOrEqual(
        viewport.height - chrome.controlsHeight - stage.edge,
      );
    }
    expect(
      artifactPreviewStage(viewport, { ...chrome, captionHeight: 0 }),
    ).toMatchObject({ captionHeight: 0, captionGap: 0, offsetY: -60 });
  });

  it("caps the caption at a share of the stage so it scrolls instead", () => {
    const stage = artifactPreviewStage(
      { width: 844, height: 390 },
      { captionHeight: 400, controlsHeight: 120 },
    );
    expect(stage.captionHeight).toBeCloseTo((390 - 120 - 32) * 0.3);
  });

  it("uses caption and wrapped-control measurements when sizing a tall photo", () => {
    const image = { width: 600, height: 1200 };
    const viewport = { width: 390, height: 844 };
    const plain = layoutArtifactPreview(image, viewport, {
      captionHeight: 0,
      controlsHeight: 64,
    });
    const captioned = layoutArtifactPreview(image, viewport, {
      captionHeight: 160,
      controlsHeight: 168,
    });
    expect(captioned.height).toBeLessThan(plain.height);
    expect(captioned.captionHeight).toBe(160);
    expect(plain.captionHeight).toBe(0);
    expect(plain.captionTop).toBe(plain.top + plain.height);
  });
});
