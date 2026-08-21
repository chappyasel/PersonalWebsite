import { describe, expect, it } from "vitest";

import { type DevHudInput, createDevHudRows } from "./devHudPresentation";

const base: DevHudInput = {
  fps: 60,
  hooksStatus: "ready",
  profile: "cinematic",
  mode: "cinematic",
  moving: false,
  frozen: false,
  customOverrides: false,
  fallbackStatus: "composer",
  p95: 16.8,
  targetFrameMs: 16.7,
  droppedFrameRatio: 0.02,
  resolutionStep: 7,
  effectsTier: "full",
  contentTier: "full",
  constraint: "gpu",
  lastTransition: {
    axis: "resolution",
    direction: "down",
    ageMs: 2_000,
  },
  dpr: 2.53,
  physicalPixels: 8_200_000,
  pixelBudget: 8_300_000,
  bloomLevels: 9,
  ambientOcclusion: true,
  ambientOcclusionHalfRes: false,
  ambientOcclusionQuality: "medium",
  depthOfField: true,
  depthOfFieldResolutionScale: 0.8,
  depthOfFieldBokehScale: 1.9,
};

const rowText = (input: DevHudInput, row: number) =>
  createDevHudRows(input)[row]?.segments.map(({ text }) => text).join("");

describe("compact development HUD presentation", () => {
  it("formats four fixed-purpose rows without explanatory labels", () => {
    const rows = createDevHudRows(base);

    expect(rows.map((row) => row.id)).toEqual([
      "frames",
      "quality",
      "axes",
      "effects",
    ]);
    expect(rowText(base, 0)).toBe("60 FPS · 16.8ms · 2%");
    expect(rowText(base, 1)).toBe("Cine M · 2.53× · 8.2/8.3MP");
    expect(rowText(base, 2)).toBe("R7↓2s · EF · CF · GPU");
    expect(rowText(base, 3)).toBe("B9 · AOM · D.8/1.9");
  });

  it("colors each performance value against its own policy-aligned threshold", () => {
    const tones = (input: DevHudInput) =>
      createDevHudRows(input)[0]?.segments
        .filter(({ emphasis }) => emphasis)
        .map(({ tone }) => tone);

    expect(tones(base)).toEqual(["positive", "positive", "positive"]);
    expect(tones({ ...base, fps: 55 })).toEqual([
      "warning",
      "positive",
      "positive",
    ]);
    expect(tones({ ...base, p95: 22 })).toEqual([
      "positive",
      "warning",
      "positive",
    ]);
    expect(tones({ ...base, droppedFrameRatio: 0.03 })).toEqual([
      "positive",
      "positive",
      "warning",
    ]);
    expect(tones({ ...base, droppedFrameRatio: 0.08 })).toEqual([
      "positive",
      "positive",
      "danger",
    ]);
  });

  it("shows all three current axes and fades a recent direction after five seconds", () => {
    expect(rowText(base, 2)).toContain("R7↓2s");
    expect(
      rowText(
        {
          ...base,
          lastTransition: {
            axis: "effects",
            direction: "up",
            ageMs: 4_100,
          },
        },
        2,
      ),
    ).toContain("EF↑5s");
    expect(
      rowText(
        {
          ...base,
          lastTransition: { ...base.lastTransition!, ageMs: 5_001 },
        },
        2,
      ),
    ).toBe("R7 · EF · CF · GPU");
  });

  it("uses the highest-priority runtime exception without overflowing the effects row", () => {
    const rows = createDevHudRows({
      ...base,
      moving: true,
      frozen: true,
      customOverrides: true,
      fallbackStatus: "direct-safety",
    });
    const effects = rows[3]?.segments;

    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "DIRECT", tone: "danger" }),
      ]),
    );
    expect(effects?.map(({ text }) => text).join("")).not.toContain("FROZEN");
  });

  it("identifies capture-grade ultra AO without widening the row model", () => {
    expect(
      rowText({ ...base, ambientOcclusionQuality: "ultra" }, 3),
    ).toContain("AOU");
  });

  it("keeps every worst-case row inside the fixed copy budget", () => {
    const rows = createDevHudRows({
      ...base,
      profile: "cinematic",
      fps: 144,
      p95: 999.9,
      droppedFrameRatio: 1,
      resolutionStep: 11,
      effectsTier: "cinematic",
      contentTier: "reduced",
      lastTransition: {
        axis: "content",
        direction: "down",
        ageMs: 4_999,
      },
      dpr: 9.99,
      physicalPixels: 99_900_000,
      pixelBudget: 99_900_000,
      bloomLevels: 99,
      ambientOcclusionQuality: "ultra",
      depthOfFieldResolutionScale: 1,
      depthOfFieldBokehScale: 9.99,
      fallbackStatus: "direct-safety",
    });

    for (const row of rows) {
      const text = row.segments.map((segment) => segment.text).join("");
      expect(text.length, `${row.id}: ${text}`).toBeLessThanOrEqual(32);
    }
  });

  it("shows dashes during startup and preserves a real missing-hook error", () => {
    expect(
      rowText({ ...base, hooksStatus: "starting", profile: null, fps: null }, 0),
    ).toBe("– FPS · –ms · –%");
    expect(
      rowText({ ...base, hooksStatus: "starting", profile: null }, 1),
    ).toBe("SCENE STARTING");
    expect(rowText({ ...base, hooksStatus: "missing", profile: null }, 1)).toBe(
      "NO SCENE HOOKS",
    );
    expect(rowText({ ...base, hooksStatus: "ready", profile: null }, 1)).toBe(
      "CALIBRATING",
    );
  });
});
