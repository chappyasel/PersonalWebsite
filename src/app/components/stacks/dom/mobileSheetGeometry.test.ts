import { describe, expect, it } from "vitest";

import {
  MOBILE_SHEET_SEAM_TOLERANCE_PX,
  mobileSheetCameraCoverage,
  mobileSheetGeometry,
  mobileSheetMaterialOverscan,
  mobileSheetMaxUpwardOverdrag,
  mobileSheetRestY,
  mobileSheetRubberBandY,
} from "./mobileSheetGeometry";

describe("mobile sheet transition geometry", () => {
  it("keeps the grabber and header fixed through both transition directions", () => {
    const geometries = (["closed", "opening", "open", "closing"] as const).map(
      mobileSheetGeometry,
    );

    expect(geometries.map((geometry) => geometry.grabberPx)).toEqual([
      24, 24, 24, 24,
    ]);
    expect(geometries.map((geometry) => geometry.headerPx)).toEqual([
      64, 64, 64, 64,
    ]);
    expect(geometries.map((geometry) => geometry.expanded)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("derives all detents from one rendered box height", () => {
    expect(mobileSheetRestY("expanded", 780, 240)).toBe(0);
    expect(mobileSheetRestY("peek", 780, 240)).toBe(540);
    expect(mobileSheetRestY("hidden", 780, 240)).toBe(780);
  });

  it("keeps detents and camera coverage based on content height", () => {
    const contentHeight = 780;
    const viewportHeight = 844;
    const peekHeight = 240;
    const overscan = mobileSheetMaterialOverscan(viewportHeight);

    expect(overscan).toBeGreaterThan(0);
    expect(mobileSheetRestY("expanded", contentHeight, peekHeight)).toBe(0);
    expect(mobileSheetRestY("peek", contentHeight, peekHeight)).toBe(540);
    expect(mobileSheetRestY("hidden", contentHeight, peekHeight)).toBe(780);
    expect(
      mobileSheetCameraCoverage(contentHeight, 0, peekHeight, viewportHeight),
    ).toBeCloseTo((contentHeight - peekHeight * 0.5) / viewportHeight);
    expect(
      mobileSheetCameraCoverage(contentHeight, 540, peekHeight, viewportHeight),
    ).toBeCloseTo((peekHeight - peekHeight * 0.5) / viewportHeight);
    expect(
      mobileSheetCameraCoverage(contentHeight, 780, peekHeight, viewportHeight),
    ).toBe(0);
  });

  it("keeps real material beyond the viewport at maximum upward overdrag", () => {
    for (const viewportHeight of [844, 1024]) {
      const maxOverdrag = mobileSheetMaxUpwardOverdrag(viewportHeight);
      const overscan = mobileSheetMaterialOverscan(viewportHeight);
      const translatedY = mobileSheetRubberBandY(
        -viewportHeight * 10,
        viewportHeight,
      );
      const materialBottom = viewportHeight + overscan + translatedY;

      expect(translatedY).toBe(-maxOverdrag);
      expect(materialBottom).toBe(
        viewportHeight + MOBILE_SHEET_SEAM_TOLERANCE_PX,
      );
      expect(materialBottom).toBeGreaterThan(viewportHeight);
    }
  });
});
