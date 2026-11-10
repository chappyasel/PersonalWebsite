import { describe, expect, it } from "vitest";

import { weekTableColors } from "./color-scale";
import {
  saveSummary,
  pounds,
  shortDate,
  signed,
  weekLine,
  weekSummary,
} from "./week-summary";
import { SYNTHETIC_LOG } from "./week-summary.fixture";
import { buildWeekTable } from "./week-table";

const summaryOn = (date: string) => weekSummary(SYNTHETIC_LOG, date);

describe("weekSummary", () => {
  it("finds the week holding the date and marks its days", () => {
    const summary = summaryOn("2030-01-23");
    expect(summary.week).toBe("2030-01-21");
    expect(summary.date).toBe("2030-01-23");
    expect(summary.phase).toBe("Bulk Jan '30 - Feb '30");
    expect(summary.days.map((day) => day.date)).toEqual([
      "2030-01-21",
      "2030-01-22",
      "2030-01-23",
      "2030-01-24",
      "2030-01-25",
      "2030-01-26",
      "2030-01-27",
    ]);
    expect(summary.days.map((day) => day.pounds)).toEqual([
      100,
      100.4,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("averages one weigh-in as itself", () => {
    const summary = summaryOn("2030-02-04");
    expect(summary.counted).toBe(1);
    expect(summary.average).toBeCloseTo(100.9);
  });

  it("averages two weigh-ins without trimming", () => {
    const summary = summaryOn("2030-01-22");
    expect(summary.counted).toBe(2);
    expect(summary.average).toBeCloseTo(100.2);
  });

  it("drops the high and low from three or more, and leaves out an excluded day", () => {
    const summary = summaryOn("2030-01-31");
    expect(summary.counted).toBe(3);
    // 100.2, 100.6, and 100.8 count; 130 is excluded. The trim keeps 100.6.
    expect(summary.average).toBeCloseTo(100.6);
    expect(summary.days[2]).toMatchObject({
      pounds: 130,
      excluded: true,
      fill: null,
    });
    expect(summary.days[0]!.fill).not.toBeNull();
  });

  it("changes from last week's average across a phase boundary", () => {
    const summary = summaryOn("2030-01-22");
    expect(summary.lastWeek).toBeCloseTo(99.5);
    expect(summary.change).toBeCloseTo(0.7);
  });

  it("has no target or gap past the plan's end", () => {
    const summary = summaryOn("2030-02-19");
    expect(summary.average).toBeCloseTo(101.6);
    expect(summary.target).toBeNull();
    expect(summary.gapToTarget).toBeNull();
    expect(summary.fills.target).toBeNull();
    expect(summary.phase).toBe("Bulk Jan '30 - Feb '30");
  });

  it("is empty for a week the log has no row for", () => {
    const summary = summaryOn("2030-02-26");
    expect(summary.week).toBe("2030-02-25");
    expect(summary.phase).toBeNull();
    expect(summary.days.every((day) => day.pounds === null)).toBe(true);
    expect(summary).toMatchObject({
      counted: 0,
      average: null,
      target: null,
      change: null,
      lastWeek: 101.6,
    });
  });

  it("colors the week as the editor's table colors it, over the whole phase", () => {
    const summary = summaryOn("2030-01-22");
    const rows = buildWeekTable(SYNTHETIC_LOG, "2");
    const colors = weekTableColors(rows)[0]!;
    expect(summary.days[0]!.fill).toEqual(colors.days[0]!.light);
    expect(summary.fills).toEqual({
      average: colors.average!.light,
      target: colors.target!.light,
      gapToTarget: colors.gapToTarget!.light,
      change: colors.change!.light,
    });
  });
});

describe("formatting", () => {
  it("shows pounds and signed differences to one decimal", () => {
    expect(pounds(100)).toBe("100.0");
    expect(pounds(100.25)).toBe("100.3");
    expect(signed(0.25)).toBe("+0.3");
    expect(signed(-0.24)).toBe("−0.2");
    expect(signed(-0.04)).toBe("0.0");
    expect(shortDate("2030-01-21")).toBe("Mon, Jan 21");
  });
});

describe("weekLine", () => {
  it("names the average, its count, the target, and how far off it is", () => {
    expect(weekLine(summaryOn("2030-01-22"))).toBe(
      "Week avg 100.2 (2 of 7), target 100.0, 0.2 over. Last week 99.5.",
    );
    expect(weekLine(summaryOn("2030-02-04"))).toBe(
      "Week avg 100.9 (1 of 7), target 101.0, 0.1 under. Last week 100.6.",
    );
  });

  it("says when there is no target, no average, or no last week", () => {
    expect(weekLine(summaryOn("2030-02-19"))).toBe(
      "Week avg 101.6 (2 of 7), no target this week.",
    );
    expect(weekLine(summaryOn("2030-02-11"))).toBe(
      "No weigh-ins count toward this week yet. Last week 100.9.",
    );
    expect(weekLine(summaryOn("2030-01-08"))).toBe(
      "Week avg 101.2 (7 of 7), target 101.0, 0.2 over.",
    );
  });

  it("reads on target when the gap rounds to zero", () => {
    const summary = { ...summaryOn("2030-01-22"), gapToTarget: 0.04 };
    expect(weekLine(summary)).toContain(", on target.");
  });
});

describe("saveSummary", () => {
  const week = summaryOn("2030-02-04");
  const line =
    "Week avg 100.9 (1 of 7), target 101.0, 0.1 under. Last week 100.6.";
  const sent = { date: "2030-02-04", pounds: 100.9 };

  it("says what each outcome did, then the week", () => {
    expect(
      saveSummary({ ...sent, status: "saved", previous: null }, week),
    ).toEqual({ summary: `100.9 saved. ${line}` });
    expect(
      saveSummary({ ...sent, status: "replaced", previous: 101.4 }, week),
    ).toEqual({ summary: `100.9 saved, replacing 101.4. ${line}` });
    expect(
      saveSummary({ ...sent, status: "unchanged", previous: 100.9 }, week),
    ).toEqual({ summary: `100.9 was already saved. ${line}` });
  });

  it("asks before replacing, and says what was kept", () => {
    expect(
      saveSummary({ ...sent, status: "exists", previous: 101.4 }, week),
    ).toEqual({
      summary: `Kept 101.4. ${line}`,
      question: "Mon, Feb 4 already has 101.4. Replace it with 100.9?",
    });
  });

  it("leaves the week off when it could not be read", () => {
    expect(
      saveSummary({ ...sent, status: "saved", previous: null }, null),
    ).toEqual({ summary: "100.9 saved." });
  });
});
