import { describe, expect, it } from "vitest";

import {
  SCREENSHOT_LENS_CENTER,
  captureLensCenterFromSearch,
  desktopLensCenter,
  desktopLensLine,
  effectiveCaptureLensCenter,
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

describe("screenshot mode lens", () => {
  it("centres the clear line on the viewport with the capture's wide band, unless the URL pins a centre", () => {
    expect(effectiveCaptureLensCenter(null, false)).toBeNull();
    expect(effectiveCaptureLensCenter(null, true)).toBe(SCREENSHOT_LENS_CENTER);
    expect(effectiveCaptureLensCenter(0.43, true)).toBe(0.43);
    const plan = sideLensPlan({
      viewportWidth: 1584,
      navRightPx: 180,
      detailsLeftPx: 1100,
      seated: false,
      captureCenter: effectiveCaptureLensCenter(null, true),
    });
    expect(plan.line).toEqual({ start: [0.5, 0], end: [0.5, 1] });
    expect(plan.taper).toBe(1);
  });
});
