import { describe, expect, it } from "vitest";

import { desktopLensCenter, desktopLensLine } from "./lensGeometry";

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
});
