import { describe, expect, it } from "vitest";

import {
  ARTIFACT_PREVIEW_DISMISS_MIN_DISTANCE_PX,
  ARTIFACT_PREVIEW_DISMISS_MIN_VELOCITY_PX_PER_MS,
  artifactPreviewShouldDismissOnRelease,
} from "./artifactPreviewDismissGesture";

const point = (x: number, y: number, time: number) => ({ x, y, time });

describe("artifact preview overscroll dismissal", () => {
  it("dismisses a vertical overscroll released above the velocity threshold", () => {
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(82, 130, 30), point(84, 172, 70)],
        1,
      ),
    ).toBe(true);
  });

  it("keeps the preview open after a slow release", () => {
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(82, 220, 400), point(84, 230, 500)],
        1,
      ),
    ).toBe(false);
  });

  it("requires enough travel before velocity can dismiss", () => {
    expect(
      artifactPreviewShouldDismissOnRelease(
        [
          point(80, 100, 0),
          point(80, 100 + ARTIFACT_PREVIEW_DISMISS_MIN_DISTANCE_PX - 1, 10),
        ],
        1,
      ),
    ).toBe(false);
  });

  it("does not mistake carousel navigation for a dismiss gesture", () => {
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(170, 135, 35)],
        1,
      ),
    ).toBe(false);
  });

  it("does not dismiss while the photo is zoomed", () => {
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(82, 180, 50)],
        1.5,
      ),
    ).toBe(false);
  });

  it("measures release velocity from the final motion window", () => {
    const threshold = ARTIFACT_PREVIEW_DISMISS_MIN_VELOCITY_PX_PER_MS;
    expect(
      artifactPreviewShouldDismissOnRelease(
        [
          point(80, 100, 0),
          point(80, 200, 200),
          point(80, 200 + threshold * 100, 300),
        ],
        1,
      ),
    ).toBe(true);
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(80, 200, 200), point(80, 200, 350)],
        1,
      ),
    ).toBe(false);
    expect(
      artifactPreviewShouldDismissOnRelease(
        [point(80, 100, 0), point(80, 400, 100), point(80, 400, 300)],
        1,
      ),
    ).toBe(false);
  });
});
