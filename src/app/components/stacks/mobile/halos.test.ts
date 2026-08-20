import { describe, expect, it } from "vitest";

import { expandAndClipTouchHalo, resolveTouchHalo } from "./halos";

describe("Touch Halos", () => {
  it("keeps a 48px target inside system and sheet gutters", () => {
    const halo = expandAndClipTouchHalo(
      { id: "edge", left: 2, top: 700, right: 12, bottom: 710, depth: 0 },
      { width: 390, height: 844, sheetTop: 600 },
    );
    expect(halo).not.toBeNull();
    expect(halo!.right - halo!.left).toBeGreaterThanOrEqual(48);
    expect(halo!.bottom - halo!.top).toBeGreaterThanOrEqual(48);
    expect(halo!.left).toBeGreaterThanOrEqual(24);
    expect(halo!.bottom).toBeLessThanOrEqual(600);
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
