import { describe, expect, it } from "vitest";

import {
  FALLBACK_COVER_RATIO,
  fitCoverInFrame,
  ICON_FRAME,
  ICON_INSET,
} from "./iconLayout";

describe("fitCoverInFrame", () => {
  const limit = ICON_FRAME - ICON_INSET * 2;

  it("fills the frame's height with a portrait cover and keeps its ratio", () => {
    const box = fitCoverInFrame({ width: 800, height: 1200 });
    expect(box.height).toBe(limit);
    expect(box.width).toBe(Math.round((limit * 800) / 1200));
    expect(box.width).toBeLessThan(box.height);
  });

  it("fills the frame's width with a landscape cover", () => {
    const box = fitCoverInFrame({ width: 1200, height: 800 });
    expect(box.width).toBe(limit);
    expect(box.height).toBe(Math.round((limit * 800) / 1200));
  });

  it("never exceeds the inset square on either axis", () => {
    for (const dims of [
      { width: 1, height: 5000 },
      { width: 5000, height: 1 },
      { width: 300, height: 300 },
      { width: 7, height: 11 },
    ]) {
      const box = fitCoverInFrame(dims);
      expect(box.width).toBeLessThanOrEqual(limit);
      expect(box.height).toBeLessThanOrEqual(limit);
      expect(box.width).toBeGreaterThanOrEqual(1);
      expect(box.height).toBeGreaterThanOrEqual(1);
    }
  });

  it("falls back to a 2:3 cover when the dimensions are unreadable", () => {
    const fallback = fitCoverInFrame(FALLBACK_COVER_RATIO);
    expect(fitCoverInFrame(null)).toEqual(fallback);
    expect(fitCoverInFrame({ width: 0, height: 0 })).toEqual(fallback);
    expect(fallback.height).toBe(limit);
    expect(fallback.width).toBe(Math.round((limit * 2) / 3));
  });

  it("rounds corners in the OG card's proportion, never below a pixel", () => {
    expect(fitCoverInFrame({ width: 2, height: 3 }).radius).toBe(
      Math.max(1, Math.round((Math.round((limit * 2) / 3) * 20) / 300)),
    );
    expect(fitCoverInFrame({ width: 1, height: 100 }).radius).toBe(1);
  });

  it("scales with a different frame", () => {
    const box = fitCoverInFrame({ width: 2, height: 3 }, 128, 12);
    expect(box.height).toBe(104);
    expect(box.width).toBe(69);
  });
});
