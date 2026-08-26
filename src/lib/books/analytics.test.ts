import { describe, expect, it } from "vitest";

import {
  type AnalyticsRow,
  LISTENING_SPEED,
  PAGES_PER_HOUR,
  computeDailyReading,
  computeReadingAnalytics,
} from "./analytics";

const book = (overrides: Partial<AnalyticsRow>): AnalyticsRow => ({
  started: null,
  finished: null,
  abandoned: null,
  abandonedAtMin: null,
  audioLengthMin: null,
  pageCount: null,
  ...overrides,
});

describe("computeReadingAnalytics", () => {
  it("attributes a book with no start date entirely to its finish day", () => {
    const result = computeReadingAnalytics([
      book({ finished: new Date("2024-03-15"), audioLengthMin: 120 }),
    ]);

    expect(result.totals.books).toBe(1);
    expect(result.totals.contentHours).toBe(2);
    expect(result.totals.wallClockHours).toBe(2 / LISTENING_SPEED);
    expect(result.monthly).toEqual([
      {
        period: "2024-03",
        wallClockHours: 1,
        contentHours: 2,
        pages: 0,
        books: 1,
      },
    ]);
    expect(result.yearly[0]?.period).toBe("2024");
  });

  it("spreads hours and pages evenly across the reading span", () => {
    // Jan 30 → Feb 3 = 5 days, 300 pages → 60 pages/day
    const result = computeReadingAnalytics([
      book({
        started: new Date("2024-01-30"),
        finished: new Date("2024-02-03"),
        pageCount: 300,
      }),
    ]);

    const jan = result.monthly.find((b) => b.period === "2024-01");
    const feb = result.monthly.find((b) => b.period === "2024-02");
    expect(jan?.pages).toBe(120); // 2 days
    expect(feb?.pages).toBe(180); // 3 days
    // Page-only books are already wall-clock (buckets round to 2 decimals)
    const totalHours = 300 / PAGES_PER_HOUR;
    expect(
      (jan?.wallClockHours ?? 0) + (feb?.wallClockHours ?? 0),
    ).toBeCloseTo(totalHours, 2);
    // Finish counted once, in February
    expect(jan?.books).toBe(0);
    expect(feb?.books).toBe(1);
  });

  it("prefers audio runtime over page count for hours", () => {
    const result = computeReadingAnalytics([
      book({
        finished: new Date("2024-06-01"),
        audioLengthMin: 600, // 10h content
        pageCount: 9999, // must not drive hours
      }),
    ]);

    expect(result.totals.contentHours).toBe(10);
    expect(result.totals.wallClockHours).toBe(10 / LISTENING_SPEED);
    expect(result.totals.pages).toBe(9999); // pages still counted as pages
  });

  it("excludes finished books with no length data and skips unfinished books", () => {
    const result = computeReadingAnalytics([
      book({ finished: new Date("2024-01-01") }), // no lengths → excluded
      book({ started: new Date("2024-01-01"), audioLengthMin: 60 }), // unfinished
    ]);

    expect(result.totals.books).toBe(0);
    expect(result.excludedCount).toBe(1);
    expect(result.monthly).toEqual([]);
  });

  it("treats started after finished as finish-day-only", () => {
    const result = computeReadingAnalytics([
      book({
        started: new Date("2024-05-10"),
        finished: new Date("2024-05-01"),
        audioLengthMin: 60,
      }),
    ]);

    expect(result.monthly).toHaveLength(1);
    expect(result.monthly[0]?.period).toBe("2024-05");
    expect(result.monthly[0]?.wallClockHours).toBe(1 / LISTENING_SPEED);
  });

  it("sums yearly buckets to the totals", () => {
    const result = computeReadingAnalytics([
      book({ finished: new Date("2023-06-01"), pageCount: 350 }),
      book({ finished: new Date("2024-06-01"), pageCount: 700 }),
    ]);

    expect(result.yearly.map((b) => b.period)).toEqual(["2023", "2024"]);
    expect(result.yearly.reduce((s, b) => s + b.pages, 0)).toBe(
      result.totals.pages,
    );
    expect(result.totals.pages).toBe(1050);
  });
});

describe("computeDailyReading", () => {
  it("spreads a book across days and marks the finish day", () => {
    // 4-day span, 2h wall-clock (240 min audio at 2×) → 0.5h/day
    const days = computeDailyReading(
      [
        book({
          started: new Date("2024-03-01"),
          finished: new Date("2024-03-04"),
          audioLengthMin: 240,
        }),
      ],
      2024,
    );

    expect(days).toHaveLength(4);
    expect(days[0]).toEqual({
      date: "2024-03-01",
      wallClockHours: 0.5,
      finishes: 0,
    });
    expect(days[3]).toEqual({
      date: "2024-03-04",
      wallClockHours: 0.5,
      finishes: 1,
    });
  });

  it("clips spans at year boundaries", () => {
    // Dec 30 2023 → Jan 2 2024 = 4 days, 4h wall-clock → 1h/day
    const row = book({
      started: new Date("2023-12-30"),
      finished: new Date("2024-01-02"),
      audioLengthMin: 480,
    });

    const in2024 = computeDailyReading([row], 2024);
    expect(in2024.map((d) => d.date)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(in2024[0]?.wallClockHours).toBe(1);
    expect(in2024[1]?.finishes).toBe(1);

    const in2023 = computeDailyReading([row], 2023);
    expect(in2023.map((d) => d.date)).toEqual(["2023-12-30", "2023-12-31"]);
    expect(in2023.every((d) => d.finishes === 0)).toBe(true);
  });

  it("accumulates overlapping books on the same day", () => {
    const days = computeDailyReading(
      [
        book({ finished: new Date("2024-07-01"), audioLengthMin: 120 }),
        book({ finished: new Date("2024-07-01"), audioLengthMin: 240 }),
      ],
      2024,
    );

    expect(days).toEqual([
      { date: "2024-07-01", wallClockHours: 3, finishes: 2 },
    ]);
  });

  it("returns an empty array for a year with no reading", () => {
    expect(
      computeDailyReading(
        [book({ finished: new Date("2024-07-01"), audioLengthMin: 60 })],
        2020,
      ),
    ).toEqual([]);
  });
});

describe("abandoned books", () => {
  it("credits only the listened position, spread to the abandoned date, without counting a finish", () => {
    const result = computeReadingAnalytics([
      book({
        started: new Date("2024-03-14"),
        abandoned: new Date("2024-03-15"),
        abandonedAtMin: 120,
        audioLengthMin: 480,
        pageCount: 400,
      }),
    ]);

    expect(result.totals.books).toBe(0);
    expect(result.totals.contentHours).toBe(2);
    expect(result.totals.wallClockHours).toBe(2 / LISTENING_SPEED);
    // Pages scale by the listened fraction: 120/480 of 400
    expect(result.totals.pages).toBe(100);
    expect(result.monthly).toHaveLength(1);
    expect(result.monthly[0]!.books).toBe(0);
    expect(result.excludedCount).toBe(0);
  });

  it("clamps a position past the runtime to the whole book", () => {
    const result = computeReadingAnalytics([
      book({
        abandoned: new Date("2024-03-15"),
        abandonedAtMin: 600,
        audioLengthMin: 480,
      }),
    ]);

    expect(result.totals.contentHours).toBe(8);
  });

  it("skips an abandoned book with no recorded position without flagging it excluded", () => {
    const result = computeReadingAnalytics([
      book({ abandoned: new Date("2024-03-15"), audioLengthMin: 480 }),
    ]);

    expect(result.totals.contentHours).toBe(0);
    expect(result.excludedCount).toBe(0);
  });

  it("puts abandoned listening hours on the daily heatmap without a finish", () => {
    const days = computeDailyReading(
      [
        book({
          started: new Date("2024-03-14"),
          abandoned: new Date("2024-03-15"),
          abandonedAtMin: 120,
          audioLengthMin: 480,
        }),
      ],
      2024,
    );

    expect(days).toHaveLength(2);
    expect(days[1]!.finishes).toBe(0);
    expect(days[0]!.wallClockHours + days[1]!.wallClockHours).toBeCloseTo(
      2 / LISTENING_SPEED,
    );
  });
});
