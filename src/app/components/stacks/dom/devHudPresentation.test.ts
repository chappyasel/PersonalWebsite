import { describe, expect, it } from "vitest";

import { type DevHudInput, createDevHudRows } from "./devHudPresentation";

const base: DevHudInput = {
  fps: 60,
  profile: "cinematic",
  mode: "cinematic",
  moving: false,
  frozen: false,
  customOverrides: false,
  fallbackStatus: "composer",
  p95: 16.8,
  targetFrameMs: 16.7,
  droppedFrameRatio: 0.02,
  dpr: 2.53,
  physicalPixels: 8_200_000,
  pixelBudget: 8_300_000,
  bloomLevels: 9,
  ambientOcclusion: true,
  ambientOcclusionHalfRes: false,
  ambientOcclusionQuality: "medium",
  depthOfField: true,
  depthOfFieldResolutionScale: 0.8,
  calls: 84,
  triangles: 1_240_000,
  textures: 42,
  programs: 18,
};

describe("compact development HUD presentation", () => {
  it("formats a stable four-row model with semantic emphasis", () => {
    const rows = createDevHudRows(base);
    expect(rows.map((row) => row.id)).toEqual([
      "frames",
      "quality",
      "effects",
      "load",
    ]);
    expect(rows[0]?.segments[0]).toMatchObject({
      text: "60 FPS",
      tone: "positive",
      emphasis: true,
    });
    expect(rows[1]?.segments.map(({ text }) => text).join("")).toBe(
      "Cinematic/Manual · 8.2/8.3MP @2.53×",
    );
    expect(rows[2]?.segments.map(({ text }) => text).join("")).toBe(
      "B9 · AOM · DoF.8",
    );
  });

  it("uses warning and danger tones at the adaptation thresholds", () => {
    expect(createDevHudRows({ ...base, p95: 22 })[0]?.segments[0]?.tone).toBe(
      "warning",
    );
    expect(
      createDevHudRows({ ...base, droppedFrameRatio: 0.4 })[0]?.segments[0]
        ?.tone,
    ).toBe("danger");
  });

  it("identifies capture-grade ultra AO without widening the row model", () => {
    const effects = createDevHudRows({
      ...base,
      ambientOcclusionQuality: "ultra",
    })[2]
      ?.segments.map(({ text }) => text)
      .join("");
    expect(effects).toContain("AOU");
  });

  it("adds concise colored exception segments without changing row count", () => {
    const rows = createDevHudRows({
      ...base,
      moving: true,
      frozen: true,
      customOverrides: true,
      fallbackStatus: "direct-safety",
    });
    const effects = rows[2]?.segments;
    expect(rows).toHaveLength(4);
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "DIRECT", tone: "danger" }),
        expect.objectContaining({ text: "FROZEN", tone: "warning" }),
        expect.objectContaining({ text: "CUSTOM", tone: "accent" }),
        expect.objectContaining({ text: "TRAVEL", tone: "accent" }),
      ]),
    );
  });
});
