import { describe, expect, it } from "vitest";

import {
  IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION,
  nextArtifactPreviewTargetCorrection,
} from "./artifactPreviewTargetCorrection";

describe("artifact preview target correction", () => {
  it("shrinks and lowers an oversized, high physical target", () => {
    expect(
      nextArtifactPreviewTargetCorrection(
        IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION,
        { left: 100, top: 100, width: 400, height: 300 },
        { left: 80, top: 70, width: 440, height: 330 },
      ),
    ).toEqual({
      scale: 400 / 440,
      offsetX: 0,
      offsetY: 15,
    });
  });

  it("ignores subpixel center noise once aligned", () => {
    expect(
      nextArtifactPreviewTargetCorrection(
        IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION,
        { left: 100, top: 100, width: 400, height: 300 },
        { left: 100.1, top: 99.9, width: 400, height: 300 },
      ),
    ).toEqual(IDENTITY_ARTIFACT_PREVIEW_TARGET_CORRECTION);
  });
});
