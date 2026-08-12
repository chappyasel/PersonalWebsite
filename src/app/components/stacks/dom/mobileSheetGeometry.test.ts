import { describe, expect, it } from "vitest";

import { mobileSheetGeometry, mobileSheetRestY } from "./mobileSheetGeometry";

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
});
