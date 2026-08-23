import { describe, expect, it } from "vitest";

import { fitArtifactPreviewToViewport } from "./artifactPreviewFit";

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
