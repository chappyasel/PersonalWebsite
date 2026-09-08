import { describe, expect, it } from "vitest";

import { formatShelfStat, sampleEvenly } from "./ogShelf";

describe("sampleEvenly", () => {
  it("keeps the spectrum's ends and proportions", () => {
    const items = Array.from({ length: 300 }, (_, i) => i);
    const picked = sampleEvenly(items, 66);
    expect(picked).toHaveLength(66);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBeGreaterThan(290);
    // Monotonic: the sample walks the shelf in order
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i]!).toBeGreaterThanOrEqual(picked[i - 1]!);
    }
  });

  it("repeats a short shelf rather than leaving holes", () => {
    expect(sampleEvenly(["a", "b", "c"], 7)).toHaveLength(7);
    expect(sampleEvenly([], 7)).toEqual([]);
  });
});

describe("formatShelfStat", () => {
  it("formats like the homepage card", () => {
    expect(formatShelfStat(12.34, "d")).toBe("12.3d");
    expect(formatShelfStat(41.06)).toBe("41.1");
    expect(formatShelfStat(null)).toBe("\u2014");
  });
});
