import { describe, expect, it } from "vitest";

import { PHASE_COLORS, dayTime } from "./chart";
import {
  calendarAxis,
  calendarMonth,
  phaseColorAt,
  phaseColorStops,
  weightAxis,
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

it("aligns long views to January 1 every year and shorter views to months or Mondays", () => {
  const years = calendarAxis([dayTime("2024-06-01"), dayTime("2027-09-01")]);
  expect(years.ticks).toEqual(
    [2025, 2026, 2027].map((year) => dayTime(`${year}-01-01`)),
  );
  expect(years.ticks.map(years.format)).toEqual(["2025", "2026", "2027"]);
  const months = calendarAxis([dayTime("2025-01-15"), dayTime("2025-07-15")]);
  expect(months.ticks.every((time) => new Date(time).getUTCDate() === 1)).toBe(
    true,
  );
  const weeks = calendarAxis([dayTime("2025-01-15"), dayTime("2025-03-15")]);
  expect(weeks.ticks.every((time) => new Date(time).getUTCDay() === 1)).toBe(
    true,
  );
  expect(
    calendarAxis([dayTime("2025-01-01"), dayTime("2025-01-03")]).ticks,
  ).toHaveLength(3);
});

it("uses pound-by-pound grid spacing with bounds on five-pound marks", () => {
  const scale = weightAxis([null, 102.4, 108.2]);
  expect(scale.domain).toEqual([100, 110]);
  expect(scale.ticks).toEqual(
    Array.from({ length: 11 }, (_, index) => 100 + index),
  );
});
