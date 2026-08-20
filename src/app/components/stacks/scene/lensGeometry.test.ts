import { describe, expect, it } from "vitest";

import {
  captureLensCenterFromSearch,
  desktopLensCenter,
  desktopLensLine,
  sideLensPlan,
} from "./lensGeometry";

describe("desktop lens geometry", () => {
  it("centers the clear line between the nav and the open card column", () => {
    expect(
      desktopLensCenter({
        viewportWidth: 1440,
        navRightPx: 180,
        detailsLeftPx: 900,
      }),
    ).toBe(0.375);
  });

  it("drives both effect endpoints from the measured center", () => {
    expect(
      desktopLensLine({
        viewportWidth: 1440,
        navRightPx: 180,
        detailsLeftPx: 900,
      }),
    ).toEqual({ start: [0.375, 0], end: [0.375, 1] });
  });

  it("uses the viewport edge when the card column is closed", () => {
    expect(
      desktopLensCenter({
        viewportWidth: 1440,
        navRightPx: 180,
        detailsLeftPx: null,
      }),
    ).toBe(0.5625);
  });

  it("contains incomplete measurements within the viewport", () => {
    expect(
      desktopLensCenter({
        viewportWidth: 0,
        navRightPx: 180,
        detailsLeftPx: 900,
      }),
    ).toBe(0.5);
    expect(
      desktopLensCenter({
        viewportWidth: 1000,
        navRightPx: 1200,
        detailsLeftPx: 900,
      }),
    ).toBe(1);
  });

  it("widens the OG clear band around the crop center", () => {
    const captureCenter = captureLensCenterFromSearch(
      "?og-lens-center=0.43333333333333335",
    );
    const plan = sideLensPlan({
      viewportWidth: 1200,
      navRightPx: 180,
      detailsLeftPx: 700,
      seated: false,
      captureCenter,
    });

    expect(captureCenter).toBeCloseTo(13 / 30, 10);
    expect(plan.line).toEqual({
      start: [captureCenter, 0],
      end: [captureCenter, 1],
    });
    expect(plan.blur).toBe(0.105);
    expect(plan.taper).toBe(1);
  });

  it("keeps the live desktop lens unchanged", () => {
    expect(
      sideLensPlan({
        viewportWidth: 1440,
        navRightPx: 180,
        detailsLeftPx: 900,
        seated: false,
        captureCenter: null,
      }),
    ).toMatchObject({
      line: { start: [0.375, 0], end: [0.375, 1] },
      blur: 0.105,
      taper: 0.6,
    });
  });
});
