import { describe, expect, it } from "vitest";

import {
  computeYearOverYearDelta,
  effectiveDaysInYear,
  monthPeriod,
} from "./yoy";

type Bucket = { period: string; pages: number };

const bucket = (period: string, pages: number): Bucket => ({ period, pages });

describe("monthPeriod", () => {
  it("zero-pads month indices", () => {
    expect(monthPeriod("2025", 0)).toBe("2025-01");
    expect(monthPeriod("2025", 11)).toBe("2025-12");
  });
});

describe("effectiveDaysInYear", () => {
  it("returns the full year length for past years", () => {
    const now = new Date(Date.UTC(2026, 5, 15));
    expect(effectiveDaysInYear("2025", now)).toBe(365);
    expect(effectiveDaysInYear("2024", now)).toBe(366); // leap year
  });

  it("returns elapsed days (inclusive of today) for the current year", () => {
    const now = new Date(Date.UTC(2026, 0, 10, 12));
    expect(effectiveDaysInYear("2026", now)).toBe(10);
  });
});

describe("computeYearOverYearDelta", () => {
  it("compares full-year totals for completed years", () => {
    const data = {
      yearly: [bucket("2024", 1000), bucket("2025", 1500)],
      monthly: [] as Bucket[],
    };
    const now = new Date(Date.UTC(2026, 5, 15));
    const delta = computeYearOverYearDelta(data, "2025", (b) => b.pages, now);
    expect(delta).not.toBeNull();
    expect(delta!.pct).toBeCloseTo(50);
    expect(delta!.label).toBe("vs 2024");
    expect(delta!.prevYear).toBe("2024");
  });

  it("prorates the current year against the previous year to date", () => {
    // Now = July 16, 2026 → compares vs Jan–Jun 2025 fully + July 2025 × 16/31
    const now = new Date(Date.UTC(2026, 6, 16));
    const monthly = Array.from({ length: 12 }, (_, i) =>
      bucket(monthPeriod("2025", i), 310),
    );
    const data = {
      yearly: [bucket("2025", 3720), bucket("2026", 2020)],
      monthly,
    };
    const delta = computeYearOverYearDelta(data, "2026", (b) => b.pages, now);
    expect(delta).not.toBeNull();
    // previous = 6 × 310 + 310 × (16/31) = 1860 + 160 = 2020 → 0% delta
    expect(delta!.pct).toBeCloseTo(0);
    expect(delta!.label).toBe("vs 2025 to date");
  });

  it("returns null when the previous year has no data", () => {
    const data = { yearly: [bucket("2025", 1200)], monthly: [] as Bucket[] };
    const now = new Date(Date.UTC(2026, 5, 15));
    expect(
      computeYearOverYearDelta(data, "2025", (b) => b.pages, now),
    ).toBeNull();
  });

  it("returns null when the current year total is zero", () => {
    const data = {
      yearly: [bucket("2024", 1000), bucket("2025", 0)],
      monthly: [] as Bucket[],
    };
    const now = new Date(Date.UTC(2026, 5, 15));
    expect(
      computeYearOverYearDelta(data, "2025", (b) => b.pages, now),
    ).toBeNull();
  });

  it("uses the injected getValue for other metrics", () => {
    type VolBucket = { period: string; volume: number };
    const data = {
      yearly: [
        { period: "2024", volume: 4_000_000 },
        { period: "2025", volume: 5_000_000 },
      ] as VolBucket[],
      monthly: [] as VolBucket[],
    };
    const now = new Date(Date.UTC(2026, 5, 15));
    const delta = computeYearOverYearDelta(data, "2025", (b) => b.volume, now);
    expect(delta!.pct).toBeCloseTo(25);
  });
});
