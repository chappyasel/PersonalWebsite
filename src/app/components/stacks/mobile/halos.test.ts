import { describe, expect, it } from "vitest";

import { expandAndClipTouchHalo, resolveTouchHalo } from "./halos";

describe("Touch Halos", () => {
  it("clips a small target at the gutter without moving it away from the object", () => {
    const halo = expandAndClipTouchHalo(
      { id: "edge", left: 26, top: 570, right: 36, bottom: 580, depth: 0 },
      { width: 390, height: 844, sheetTop: 600 },
    );
    expect(halo).not.toBeNull();
    expect(halo!.right).toBe(55);
    expect(halo!.top).toBe(551);
    expect(halo!.left).toBeGreaterThanOrEqual(24);
    expect(halo!.bottom).toBeLessThanOrEqual(600);
  });

  it("does not move an object hidden below the sheet into the exposed world", () => {
    expect(
      expandAndClipTouchHalo(
        {
          id: "floor-dumbbell",
          left: 120,
          top: 610,
          right: 300,
          bottom: 770,
          depth: 0,
        },
        { width: 390, height: 844, sheetTop: 600 },
      ),
    ).toBeNull();
  });

  it("clips a partly visible enlarged prop without pushing its target upward", () => {
    const halo = expandAndClipTouchHalo(
      {
        id: "floor-dumbbell",
        left: 120,
        top: 540,
        right: 300,
        bottom: 790,
        depth: 0,
      },
      { width: 390, height: 844, sheetTop: 600 },
    )!;
    expect(halo.top).toBe(540);
    expect(resolveTouchHalo(200, 400, [halo])).toBeNull();
  });

  it("leaves empty space inside a large object's bounding box available to dismiss", () => {
    const halo = expandAndClipTouchHalo(
      {
        id: "zoomed-prop",
        left: 100,
        top: 100,
        right: 300,
        bottom: 300,
        depth: 0,
        exactHit: false,
      },
      { width: 390, height: 844, sheetTop: 600 },
    )!;
    expect(resolveTouchHalo(110, 110, [halo])).toBeNull();
    expect(resolveTouchHalo(110, 110, [{ ...halo, exactHit: true }])?.id).toBe(
      "zoomed-prop",
    );
  });

  it("keeps minimum-size assistance for a genuinely small object", () => {
    const halo = expandAndClipTouchHalo(
      {
        id: "small",
        left: 190,
        top: 190,
        right: 210,
        bottom: 210,
        depth: 0,
        exactHit: false,
      },
      { width: 390, height: 844, sheetTop: 600 },
    )!;
    expect(resolveTouchHalo(180, 200, [halo])?.id).toBe("small");
  });

  it("resolves exact hit, visual distance, authored priority, then depth", () => {
    const common = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(
      resolveTouchHalo(50, 50, [
        { ...common, id: "near", depth: 0.1 },
        { ...common, id: "exact", depth: 0.8, exactHit: true },
      ])?.id,
    ).toBe("exact");
    expect(
      resolveTouchHalo(50, 50, [
        { ...common, id: "low", depth: 0.1, priority: 0 },
        { ...common, id: "high", depth: 0.8, priority: 2 },
      ])?.id,
    ).toBe("high");
  });
});
