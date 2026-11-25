import { describe, expect, it } from "vitest";

import { appCardRows, appSheet, carriedWeighIn } from "./app-sheet";
import { weekCard } from "./week-card";
import { SUMMARY_COLUMNS } from "./week-columns";
import { SYNTHETIC_LOG } from "./week-summary.fixture";

describe("appSheet", () => {
  const today = "2030-02-05";
  const sheet = appSheet(SYNTHETIC_LOG, { today, phaseId: null, runningId: null });

  it("shows the phase holding today, newest phase first in the picker", () => {
    expect(sheet.phaseId).toBe("2");
    expect(sheet.phases.map((phase) => phase.id)).toEqual(["2", "1"]);
    expect(sheet.phases[0]).toMatchObject({ cycle: 2, color: "#dc2626" });
    expect(sheet.columns.map((column) => column.label)).toEqual(
      SUMMARY_COLUMNS.map((column) => column.label),
    );
  });

  it("numbers weeks from the phase start and marks today and editable days", () => {
    const rows = sheet.sections.at(-1)!.rows;
    expect(rows.map((row) => row.number)).toEqual([0, 1, 2, 3, 4]);
    const thisWeek = rows.find((row) => row.week === "2030-02-04")!;
    expect(thisWeek).toMatchObject({ month: "Feb", day: "4" });
    expect(thisWeek.days[0]).toMatchObject({ text: "100.9", editable: true });
    expect(thisWeek.days[1]).toMatchObject({ isToday: true, editable: true });
    expect(thisWeek.days[2]).toMatchObject({ text: "", editable: false });
  });

  it("keeps an excluded weigh-in's text with no fill", () => {
    const row = sheet.sections.at(-1)!.rows.find((r) => r.week === "2030-01-28")!;
    expect(row.days[2]).toMatchObject({ text: "130.0", excluded: true, color: null });
    expect(row.days[0]!.color).not.toBeNull();
  });

  it("only lets a week with a rate take a plan edit", () => {
    const rows = sheet.sections.at(-1)!.rows;
    expect(rows[0]!.planEditable).toBe(false);
    expect(rows[1]!.planEditable).toBe(true);
  });

  it("shows a picked phase, and falls back when the pick is gone", () => {
    expect(
      appSheet(SYNTHETIC_LOG, { today, phaseId: "1", runningId: null }).phaseId,
    ).toBe("1");
    expect(
      appSheet(SYNTHETIC_LOG, { today, phaseId: "99", runningId: null }).phaseId,
    ).toBe("2");
  });

  it("gives today's week its own section when no phase holds it", () => {
    const later = appSheet(SYNTHETIC_LOG, {
      today: "2030-03-06",
      phaseId: null,
      runningId: null,
    });
    expect(later.sections[0]).toMatchObject({
      title: "Outside every phase",
      phaseId: null,
    });
    expect(later.sections[0]!.rows[0]!.week).toBe("2030-03-04");
  });
});

describe("carriedWeighIn", () => {
  it("skips excluded weigh-ins and today's own", () => {
    expect(carriedWeighIn(SYNTHETIC_LOG, "2030-02-04")).toEqual({
      date: "2030-01-31",
      pounds: 100.8,
    });
    expect(carriedWeighIn(SYNTHETIC_LOG, "2030-02-05")).toEqual({
      date: "2030-02-04",
      pounds: 100.9,
    });
  });
});

describe("appCardRows", () => {
  it("is the card's three weeks, ending with the date's", () => {
    const rows = appCardRows(weekCard(SYNTHETIC_LOG, "2030-02-05", null));
    expect(rows.map((row) => row.week)).toEqual([
      "2030-01-21",
      "2030-01-28",
      "2030-02-04",
    ]);
    expect(rows.at(-1)!.days[1]!.isToday).toBe(true);
  });
});
