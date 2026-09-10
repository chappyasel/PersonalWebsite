import { describe, expect, it } from "vitest";

import { PHASE_COLORS, dayTime } from "./chart";
import {
  calendarMonth,
  phaseColorAt,
  phaseColorStops,
  weightCellStyle,
} from "./presentation";
import type { WeightLog } from "./schema";

const phases: WeightLog["phases"] = [
  {
    id: "gain",
    label: "Gain",
    kind: "bulk",
    start: "2020-01-01",
    end: "2020-01-14",
  },
  {
    id: "lose",
    label: "Lose",
    kind: "cut",
    start: "2020-01-08",
    end: "2020-01-21",
  },
  {
    id: "hold",
    label: "Hold",
    kind: "maintenance",
    start: "2020-01-22",
    end: "2020-01-28",
  },
];

describe("phase colors", () => {
  it("switches at the new phase start, including overlapping templates", () => {
    expect(phaseColorAt(dayTime("2020-01-07"), phases)).toBe(PHASE_COLORS.bulk);
    expect(phaseColorAt(dayTime("2020-01-08"), [...phases].reverse())).toBe(
      PHASE_COLORS.cut,
    );
    expect(phaseColorAt(dayTime("2020-01-21") + 43_200_000, phases)).toBe(
      PHASE_COLORS.cut,
    );
    expect(phaseColorAt(dayTime("2020-01-22"), phases)).toBe(
      PHASE_COLORS.maintenance,
    );
    expect(phaseColorAt(dayTime("2020-01-29"), phases)).toBe(
      PHASE_COLORS.other,
    );
  });

  it("keeps transitions sharp and anchored to dates when the view is cropped", () => {
    expect(
      phaseColorStops(phases, [dayTime("2020-01-07"), dayTime("2020-01-09")]),
    ).toEqual([
      { offset: 0, color: PHASE_COLORS.bulk },
      { offset: 0.5, color: PHASE_COLORS.bulk },
      { offset: 0.5, color: PHASE_COLORS.cut },
      { offset: 1, color: PHASE_COLORS.cut },
    ]);
    expect(
      phaseColorStops(phases, [dayTime("2020-01-08"), dayTime("2020-01-08")]),
    ).toEqual([
      { offset: 0, color: PHASE_COLORS.cut },
      { offset: 1, color: PHASE_COLORS.cut },
    ]);
  });
});

describe("weight calendar", () => {
  it("uses a blue-white-red scale with readable text and a neutral constant history", () => {
    expect(weightCellStyle(100, 100, 200)).toEqual({
      backgroundColor: "rgb(37, 99, 235)",
      color: "#ffffff",
    });
    expect(weightCellStyle(150, 100, 200)).toEqual({
      backgroundColor: "rgb(248, 250, 252)",
      color: "#000000",
    });
    expect(weightCellStyle(200, 100, 200)).toEqual({
      backgroundColor: "rgb(220, 38, 38)",
      color: "#ffffff",
    });
    expect(weightCellStyle(100, 100, 100).backgroundColor).toBe(
      "rgb(248, 250, 252)",
    );
  });

  it("places leap days and year boundaries in Monday-first UTC calendars", () => {
    expect(calendarMonth(2020, 1)).toMatchObject({ offset: 5 });
    expect(calendarMonth(2020, 1).dates.at(-1)).toBe("2020-02-29");
    expect(calendarMonth(2021, 1).dates).toHaveLength(28);
    expect(calendarMonth(2024, 0).offset).toBe(0);
    expect(calendarMonth(2024, 11).dates.at(-1)).toBe("2024-12-31");
  });
});
