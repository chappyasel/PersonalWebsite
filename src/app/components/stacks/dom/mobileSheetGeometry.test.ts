import { describe, expect, it } from "vitest";

import {
  MOBILE_RAIL_FONT_CLAMP,
  MOBILE_SHEET_SEAM_TOLERANCE_PX,
  MOBILE_SHEET_TITLE_CLAMP,
  MOBILE_SHEET_WHEEL_COOLDOWN_MS,
  accumulateMobileSheetWheelIntent,
  mobileRailScale,
  mobileSheetCameraCoverage,
  mobileSheetChipActive,
  mobileSheetGeometry,
  mobileSheetHidden,
  mobileSheetHorizontalSwipeIntent,
  mobileSheetMaterialOverscan,
  mobileSheetMaxUpwardOverdrag,
  mobileSheetPeekHeight,
  mobileSheetPublishedCoverage,
  mobileSheetRenderedHeight,
  mobileSheetRestY,
  mobileSheetRubberBandY,
  mobileSheetScrollIntent,
  mobileSheetTitlePx,
} from "./mobileSheetGeometry";

describe("mobile sheet transition geometry", () => {
  it("does not reuse a short resident's measurement after its body mounts", () => {
    const peekHeight = 253;
    const systemsHeight = 780;
    const contentlessMeasurement = {
      requestedHeight: peekHeight,
      renderedHeight: peekHeight,
    };

    expect(
      mobileSheetRenderedHeight(systemsHeight, contentlessMeasurement),
    ).toBe(systemsHeight);
    expect(
      mobileSheetRestY(
        "peek",
        mobileSheetRenderedHeight(systemsHeight, contentlessMeasurement),
        peekHeight,
      ),
    ).toBe(systemsHeight - peekHeight);
    expect(
      mobileSheetRenderedHeight(systemsHeight, {
        requestedHeight: systemsHeight,
        renderedHeight: 760,
      }),
    ).toBe(760);
  });

  it("uses a bounded 30% resident detent and 64px short-landscape header", () => {
    expect(mobileSheetPeekHeight(390, 844)).toBe(253);
    expect(mobileSheetPeekHeight(320, 568)).toBe(170);
    expect(mobileSheetPeekHeight(768, 1024)).toBe(280);
    expect(mobileSheetPeekHeight(844, 390)).toBe(64);
  });
  it("reveals the pill only after its dismissed sheet is physically parked", () => {
    expect(
      mobileSheetChipActive({
        active: true,
        hidden: true,
        modalOpen: false,
        sheetParked: false,
      }),
    ).toBe(false);
    expect(
      mobileSheetChipActive({
        active: true,
        hidden: true,
        modalOpen: false,
        sheetParked: true,
      }),
    ).toBe(true);
  });

  it("returns during artifact close while ordinary modals remain hidden", () => {
    expect(
      mobileSheetHidden({
        dismissed: false,
        modalOpen: true,
        artifactReturning: false,
      }),
    ).toBe(true);
    expect(
      mobileSheetHidden({
        dismissed: false,
        modalOpen: true,
        artifactReturning: true,
      }),
    ).toBe(false);
    expect(
      mobileSheetHidden({
        dismissed: true,
        modalOpen: true,
        artifactReturning: true,
      }),
    ).toBe(true);
  });

  it("keeps the camera fixed while the sheet returns behind a modal", () => {
    const input = {
      narrow: true,
      viewportHeight: 844,
      renderedHeight: 760,
      sheetY: 507,
      peekHeight: 253,
    };
    expect(mobileSheetPublishedCoverage({ ...input, modalOpen: true })).toBe(0);
    expect(
      mobileSheetPublishedCoverage({ ...input, modalOpen: false }),
    ).toBeCloseTo(0.1499, 4);
  });

  it("commits deliberate horizontal swipes in physical room order", () => {
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: -80, velocityX: 0.2 }),
    ).toBe(1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: 80, velocityX: 0.2 }),
    ).toBe(-1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: -12, velocityX: -0.8 }),
    ).toBe(1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: 30, velocityX: -0.8 }),
    ).toBe(1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: -30, velocityX: 0.8 }),
    ).toBe(-1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: 30, velocityX: 0.2 }),
    ).toBeNull();
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: -40, velocityX: 0.2 }),
    ).toBe(1);
    expect(
      mobileSheetHorizontalSwipeIntent({ deltaX: 12, velocityX: 0.5 }),
    ).toBe(-1);
  });
  it("keeps the grabber and header fixed through both transition directions", () => {
    const geometries = (["closed", "opening", "open", "closing"] as const).map(
      mobileSheetGeometry,
    );

    expect(geometries.map((geometry) => geometry.grabberPx)).toEqual([
      16, 16, 16, 16,
    ]);
    expect(geometries.map((geometry) => geometry.headerPx)).toEqual([
      48, 48, 48, 48,
    ]);
    expect(geometries.map((geometry) => geometry.expanded)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("grows the title row with the title, by its leading, and only past phones", () => {
    expect(mobileSheetTitlePx(390)).toBe(20);
    expect(mobileSheetTitlePx(400)).toBeCloseTo(20, 10);
    expect(mobileSheetTitlePx(570)).toBeCloseTo(24.5, 10);
    expect(mobileSheetTitlePx(740)).toBeCloseTo(29, 10);
    expect(mobileSheetTitlePx(820)).toBe(29);
    // The CSS clamp is the same curve, in rem at the 16px root.
    expect(MOBILE_SHEET_TITLE_CLAMP).toBe(
      "clamp(1.25rem, 0.588rem + 2.647vw, 1.8125rem)",
    );
    expect(mobileSheetGeometry("open", 390).headerPx).toBe(48);
    expect(mobileSheetGeometry("open", 820).headerPx).toBe(48 + 1.5 * 9);
    // The icon rail rides the same curve at a fifth of the growth.
    expect(mobileRailScale(390)).toBe(1);
    expect(mobileRailScale(570)).toBeCloseTo(1.1, 10);
    expect(mobileRailScale(820)).toBe(1.2);
    expect(MOBILE_RAIL_FONT_CLAMP).toBe(
      "clamp(1rem, 0.765rem + 0.941vw, 1.2rem)",
    );
    expect(mobileSheetGeometry("closed", 820).headerPx).toBe(
      mobileSheetGeometry("open", 820).headerPx,
    );
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

  it("turns only content-boundary wheel attempts into detent changes", () => {
    expect(
      mobileSheetScrollIntent({
        expanded: false,
        canExpand: true,
        scrollTop: 0,
        deltaY: 24,
      }),
    ).toBe("expand");
    expect(
      mobileSheetScrollIntent({
        expanded: false,
        canExpand: true,
        scrollTop: 0,
        deltaY: -24,
      }),
    ).toBeNull();
    expect(
      mobileSheetScrollIntent({
        expanded: false,
        canExpand: false,
        scrollTop: 0,
        deltaY: 24,
      }),
    ).toBeNull();
    expect(
      mobileSheetScrollIntent({
        expanded: true,
        canExpand: true,
        scrollTop: 0,
        deltaY: -24,
      }),
    ).toBe("collapse");
    expect(
      mobileSheetScrollIntent({
        expanded: true,
        canExpand: true,
        scrollTop: 40,
        deltaY: -24,
      }),
    ).toBeNull();
    expect(
      mobileSheetScrollIntent({
        expanded: true,
        canExpand: true,
        scrollTop: 0,
        deltaY: 24,
      }),
    ).toBeNull();
  });

  it("requires sustained boundary intent and resets after a pause", () => {
    let state = null;
    for (const [at, deltaY] of [
      [0, 9],
      [12, 10],
      [24, 8],
    ] as const) {
      const result = accumulateMobileSheetWheelIntent({
        state,
        intent: "expand",
        deltaY,
        at,
        lockedUntil: 0,
      });
      expect(result.committed).toBeNull();
      expect(result.consume).toBe(true);
      state = result.state;
    }

    const committed = accumulateMobileSheetWheelIntent({
      state,
      intent: "expand",
      deltaY: 10,
      at: 36,
      lockedUntil: 0,
    });
    expect(committed.committed).toBe("expand");
    expect(committed.state).toBeNull();

    const afterPause = accumulateMobileSheetWheelIntent({
      state: { intent: "collapse", distance: 30, lastAt: 0 },
      intent: "collapse",
      deltaY: -8,
      at: 200,
      lockedUntil: 0,
    });
    expect(afterPause.committed).toBeNull();
    expect(afterPause.state?.distance).toBe(8);
  });

  it("resets on direction changes and consumes post-snap momentum", () => {
    const reversed = accumulateMobileSheetWheelIntent({
      state: { intent: "expand", distance: 30, lastAt: 20 },
      intent: "collapse",
      deltaY: -8,
      at: 30,
      lockedUntil: 0,
    });
    expect(reversed.committed).toBeNull();
    expect(reversed.state).toEqual({
      intent: "collapse",
      distance: 8,
      lastAt: 30,
    });

    const locked = accumulateMobileSheetWheelIntent({
      state: null,
      intent: "expand",
      deltaY: 60,
      at: MOBILE_SHEET_WHEEL_COOLDOWN_MS - 1,
      lockedUntil: MOBILE_SHEET_WHEEL_COOLDOWN_MS,
    });
    expect(locked).toEqual({ state: null, committed: null, consume: true });

    const native = accumulateMobileSheetWheelIntent({
      state: reversed.state,
      intent: null,
      deltaY: 20,
      at: 40,
      lockedUntil: 0,
    });
    expect(native).toEqual({ state: null, committed: null, consume: false });
  });
});
