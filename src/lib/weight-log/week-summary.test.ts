import { describe, expect, it } from "vitest";

import { pounds, signed } from "./format";
import {
  ownerToday,
  saveSummary,
  shortDate,
  weekLine,
  weekSummary,
} from "./week-summary";
import { HALF_TENTH_LOG, SYNTHETIC_LOG } from "./week-summary.fixture";

const summaryOn = (date: string) => weekSummary(SYNTHETIC_LOG, date);

describe("weekSummary", () => {
  it("averages one weigh-in as itself", () => {
    expect(summaryOn("2030-02-04").average).toBeCloseTo(100.9);
  });

  it("averages two weigh-ins without trimming", () => {
    expect(summaryOn("2030-01-22").average).toBeCloseTo(100.2);
  });

  it("drops the high and low from three or more, and leaves out an excluded day", () => {
    // 100.2, 100.6, and 100.8 count; 130 is excluded. The trim keeps 100.6.
    expect(summaryOn("2030-01-31").average).toBeCloseTo(100.6);
  });

  it("has no target or gap past the plan's end", () => {
    const summary = summaryOn("2030-02-19");
    expect(summary.average).toBeCloseTo(101.6);
    expect(summary.target).toBeNull();
    expect(summary.gapToTarget).toBeNull();
  });

  it("is empty for a week the log has no row for", () => {
    expect(summaryOn("2030-02-26")).toEqual({
      average: null,
      target: null,
      gapToTarget: null,
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

describe("a mean that ends in a hundredths 5", () => {
  const summary = weekSummary(HALF_TENTH_LOG, "2030-02-05");

  it("rounds the way the editor's weekly table does", () => {
    expect(summary.average).toBeCloseTo(150.35, 10);
    expect(pounds(summary.average)).toBe(summary.average!.toFixed(1));
    expect(pounds(summary.average)).toBe("150.3");
    expect(signed(summary.gapToTarget)).toBe("+0.3");
  });

  it("writes a line whose numbers agree", () => {
    expect(weekLine(summary)).toBe("Avg 150.3 · 0.3 over target");
  });
});

describe("weekLine", () => {
  it("names the average and how far it is from the target", () => {
    expect(weekLine(summaryOn("2030-01-22"))).toBe(
      "Avg 100.2 · 0.2 over target",
    );
    expect(weekLine(summaryOn("2030-02-04"))).toBe(
      "Avg 100.9 · 0.1 under target",
    );
  });

  it("is the average alone past the plan's end", () => {
    expect(weekLine(summaryOn("2030-02-19"))).toBe("Avg 101.6");
  });

  it("reads on target when the gap rounds to zero", () => {
    const summary = { ...summaryOn("2030-01-22"), gapToTarget: 0.04 };
    expect(weekLine(summary)).toBe("Avg 100.2 · on target");
  });

  it("is never empty", () => {
    expect(weekLine(summaryOn("2030-02-11"))).toBe("No average yet");
    expect(weekLine(summaryOn("2030-02-26"))).toBe("No average yet");
    expect(weekLine(null)).toBe("Week unavailable");
  });
});

describe("saveSummary", () => {
  const week = summaryOn("2030-02-04");
  const line = "Avg 100.9 · 0.1 under target";
  const sent = { date: "2030-02-04", pounds: 100.9 };
  const today = "2030-02-04";

  it("titles each outcome with its symbol, then gives the week", () => {
    expect(
      saveSummary(
        { ...sent, status: "saved", previous: null, excluded: false },
        week,
        today,
      ),
    ).toEqual({ title: "✓ 100.9", summary: line });
    expect(
      saveSummary(
        { ...sent, status: "replaced", previous: 101.4, excluded: false },
        week,
        today,
      ),
    ).toEqual({ title: "↻ 100.9, was 101.4", summary: line });
    expect(
      saveSummary(
        { ...sent, status: "unchanged", previous: 100.9, excluded: false },
        week,
        today,
      ),
    ).toEqual({ title: "= 100.9", summary: line });
  });

  it("asks before replacing today's weigh-in", () => {
    expect(
      saveSummary(
        { ...sent, status: "exists", previous: 101.4, excluded: false },
        week,
        today,
      ),
    ).toEqual({
      title: "Kept 101.4",
      summary: line,
      question: "Today has 101.4. Replace with 100.9?",
    });
  });

  it("names the date when it is not today in the owner's time zone", () => {
    const exists = {
      ...sent,
      status: "exists",
      previous: 101.4,
      excluded: false,
    } as const;
    expect(saveSummary(exists, week, "2030-02-05").question).toBe(
      "Mon, Feb 4 has 101.4. Replace with 100.9?",
    );
    expect(saveSummary(exists, week, "2030-02-03").question).toBe(
      "Mon, Feb 4 has 101.4. Replace with 100.9?",
    );
  });

  it("marks a weigh-in left out of the weekly average", () => {
    const excluded = { ...sent, previous: 101.4, excluded: true };
    expect(saveSummary({ ...excluded, status: "exists" }, week, today)).toEqual(
      {
        title: "Kept 101.4 · excluded",
        summary: line,
        question:
          "Today has 101.4, excluded. Replace with 100.9? It stays excluded.",
      },
    );
    expect(
      saveSummary({ ...excluded, status: "replaced" }, week, today),
    ).toEqual({ title: "↻ 100.9, was 101.4 · excluded", summary: line });
    expect(
      saveSummary(
        { ...excluded, status: "unchanged", previous: 100.9 },
        week,
        today,
      ),
    ).toEqual({ title: "= 100.9 · excluded", summary: line });
  });

  it("still titles the save when the week could not be read", () => {
    expect(
      saveSummary(
        { ...sent, status: "saved", previous: null, excluded: false },
        null,
        today,
      ),
    ).toEqual({ title: "✓ 100.9", summary: "Week unavailable" });
  });
});

describe("ownerToday", () => {
  it("is the date in Pacific time, not UTC", () => {
    // 05:00 UTC on Feb 5 is 21:00 on Feb 4 in Los Angeles.
    expect(ownerToday(new Date("2030-02-05T05:00:00Z"))).toBe("2030-02-04");
    expect(ownerToday(new Date("2030-02-05T09:00:00Z"))).toBe("2030-02-05");
  });
});
