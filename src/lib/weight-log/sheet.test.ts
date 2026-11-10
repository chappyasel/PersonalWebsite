import { describe, expect, it } from "vitest";

import {
  bareRow,
  cellKey,
  editableCells,
  phaseHolding,
  rateEdit,
  readNumber,
  targetEdit,
  undoOf,
  weighInEdit,
  withWeeks,
} from "./sheet";
import type { WeekTableRow } from "./week-table";

// Invented numbers. None of them is the owner's.

const empty = [null, null, null, null, null, null, null];
const row = (
  week: string,
  target: number | null,
  poundsPerWeek: number | null,
): WeekTableRow => ({
  week,
  weights: empty,
  excludedDays: [],
  average: null,
  change: null,
  target,
  gapToTarget: null,
  poundsPerWeek,
  originalTarget: target,
  gapToOriginalTarget: null,
});

describe("readNumber", () => {
  it("reads pounds, the table's minus sign, and a decimal comma", () => {
    expect(readNumber(" 120.4 ")).toBe(120.4);
    expect(readNumber("−0.5")).toBe(-0.5);
    expect(readNumber("120,4")).toBe(120.4);
    expect(readNumber(".5")).toBe(0.5);
  });

  it("tells an empty cell from text that isn't a number", () => {
    expect(readNumber("  ")).toBe("empty");
    expect(readNumber("1e2")).toBe("invalid");
    expect(readNumber("12abc")).toBe("invalid");
    expect(readNumber("-")).toBe("invalid");
  });
});

describe("weighInEdit", () => {
  it("saves a new weigh-in to one decimal place", () => {
    expect(weighInEdit("2030-01-08", "120.44", null)).toEqual({
      type: "saveWeighIn",
      date: "2030-01-08",
      pounds: 120.4,
    });
  });

  it("sends nothing for the same pounds or an empty day left empty", () => {
    expect(weighInEdit("2030-01-08", "120.40", 120.4)).toEqual({
      type: "none",
    });
    expect(weighInEdit("2030-01-08", "", null)).toEqual({ type: "none" });
  });

  it("deletes the weigh-in when the cell is cleared", () => {
    expect(weighInEdit("2030-01-08", "", 120.4)).toEqual({
      type: "deleteWeighIn",
      date: "2030-01-08",
    });
  });

  it("refuses what the server would", () => {
    expect(weighInEdit("2030-01-08", "0.04", null).type).toBe("invalid");
    expect(weighInEdit("2030-01-08", "1500.1", null).type).toBe("invalid");
    expect(weighInEdit("2030-01-08", "abc", null)).toEqual({
      type: "invalid",
      message: "Type a weight in pounds.",
    });
  });
});

describe("targetEdit", () => {
  it("is the rate from the previous week's target", () => {
    expect(targetEdit("2030-01-14", "121.3", 121, 120.5)).toEqual({
      type: "changeRate",
      week: "2030-01-14",
      poundsPerWeek: 0.8,
    });
    expect(targetEdit("2030-01-14", "119", 121, 120.5)).toEqual({
      type: "changeRate",
      week: "2030-01-14",
      poundsPerWeek: -1.5,
    });
  });

  it("rounds the target to a tenth and the rate to a hundredth", () => {
    expect(targetEdit("2030-01-14", "121.04", 120.9, 120.333333)).toEqual({
      type: "changeRate",
      week: "2030-01-14",
      poundsPerWeek: 0.67,
    });
  });

  it("sends nothing for the target the cell shows", () => {
    expect(targetEdit("2030-01-14", "121.0", 121.03, 120.5)).toEqual({
      type: "none",
    });
    expect(targetEdit("2030-01-14", "", 121, 120.5)).toEqual({ type: "none" });
  });

  it("refuses a target more than the largest rate from the week before", () => {
    expect(targetEdit("2030-01-14", "131", 121, 120.5)).toEqual({
      type: "invalid",
      message: "A target can be at most 10 lb from the week before.",
    });
    expect(targetEdit("2030-01-14", "0", 121, 120.5).type).toBe("invalid");
  });
});

describe("rateEdit", () => {
  it("sends the rate to two decimals", () => {
    expect(rateEdit("2030-01-14", "−0.333", 0.5)).toEqual({
      type: "changeRate",
      week: "2030-01-14",
      poundsPerWeek: -0.33,
    });
  });

  it("sends nothing for the same rate or an empty cell", () => {
    expect(rateEdit("2030-01-14", "0.50", 0.5)).toEqual({ type: "none" });
    expect(rateEdit("2030-01-14", "", 0.5)).toEqual({ type: "none" });
  });

  it("refuses a rate past the server's limit", () => {
    expect(rateEdit("2030-01-14", "10.5", 0.5).type).toBe("invalid");
    expect(rateEdit("2030-01-14", "-10", 0.5)).toEqual({
      type: "changeRate",
      week: "2030-01-14",
      poundsPerWeek: -10,
    });
  });
});

describe("undoOf", () => {
  it("deletes a weigh-in the change added", () => {
    expect(
      undoOf({ kind: "weighIn", date: "2030-01-08", before: null, after: 1 }),
    ).toEqual({ mutation: "deleteWeighIn", input: { date: "2030-01-08" } });
  });

  it("restores the pounds a replace or a delete removed", () => {
    const restore = {
      mutation: "upsertWeighIn",
      input: { date: "2030-01-08", pounds: 120.4 },
    };
    expect(
      undoOf({
        kind: "weighIn",
        date: "2030-01-08",
        before: 120.4,
        after: 121,
      }),
    ).toEqual(restore);
    expect(
      undoOf({
        kind: "weighIn",
        date: "2030-01-08",
        before: 120.4,
        after: null,
      }),
    ).toEqual(restore);
  });

  it("sets the week's old rate back", () => {
    expect(
      undoOf({
        kind: "rate",
        phaseId: "3",
        week: "2030-01-14",
        before: 0.5,
        after: 0.8,
      }),
    ).toEqual({
      mutation: "changeRate",
      input: { phaseId: "3", weekStart: "2030-01-14", poundsPerWeek: 0.5 },
    });
  });
});

describe("editableCells", () => {
  const rows = [
    row("2030-01-07", 120, null),
    row("2030-01-14", 120.5, 0.5),
    row("2030-01-21", null, null),
  ];

  it("lists days through today, then each week's target and lb/wk", () => {
    const keys = editableCells(rows, "2030-01-16").map(cellKey);
    expect(keys).toEqual([
      "day:2030-01-07",
      "day:2030-01-08",
      "day:2030-01-09",
      "day:2030-01-10",
      "day:2030-01-11",
      "day:2030-01-12",
      "day:2030-01-13",
      "day:2030-01-14",
      "day:2030-01-15",
      "day:2030-01-16",
      "target:2030-01-14",
      "rate:2030-01-14",
    ]);
  });

  it("keeps a phase's first week and a week with no target read-only", () => {
    const keys = editableCells(rows, "2030-01-28").map(cellKey);
    expect(keys).not.toContain("target:2030-01-07");
    expect(keys).not.toContain("rate:2030-01-07");
    expect(keys).not.toContain("target:2030-01-21");
  });

  it("leaves the plan out while a plan edit is landing", () => {
    const keys = editableCells(rows, "2030-01-16", { plan: false }).map(
      cellKey,
    );
    expect(keys.some((key) => !key.startsWith("day:"))).toBe(false);
  });
});

describe("phaseHolding", () => {
  const phases = [
    { id: "2", start: "2030-02-04", end: "2030-03-03" },
    { id: "1", start: "2030-01-07", end: "2030-02-03" },
  ];

  it("finds the phase whose dates cover the day", () => {
    expect(phaseHolding("2030-01-20", phases, "2")?.id).toBe("1");
    expect(phaseHolding("2030-02-04", phases, "2")?.id).toBe("2");
  });

  it("lets the running phase hold days past its plan", () => {
    expect(phaseHolding("2030-04-01", phases, "2")?.id).toBe("2");
    expect(phaseHolding("2030-04-01", phases, null)).toBeUndefined();
  });

  it("finds nothing before the first phase", () => {
    expect(phaseHolding("2029-12-31", phases, "2")).toBeUndefined();
  });
});

describe("bareRow and withWeeks", () => {
  it("averages the counted days of a week the table lacks", () => {
    const bare = bareRow({
      week: "2030-01-21",
      weights: [120, 150, 121, ...empty.slice(3)],
      excludedDays: [1],
    });
    expect(bare.average).toBeCloseTo(120.5);
    expect(bare.target).toBeNull();
    expect(bare.excludedDays).toEqual([1]);
  });

  it("adds a missing week in calendar order and keeps the table's own", () => {
    const rows = [row("2030-01-07", 120, null), row("2030-01-28", 121, 0.5)];
    const merged = withWeeks(rows, [
      bareRow({ week: "2030-01-14", weights: empty, excludedDays: [] }),
      bareRow({ week: "2030-01-28", weights: empty, excludedDays: [] }),
    ]);
    expect(merged.map((item) => [item.week, item.target])).toEqual([
      ["2030-01-07", 120],
      ["2030-01-14", null],
      ["2030-01-28", 121],
    ]);
  });
});
