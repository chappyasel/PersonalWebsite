import { describe, expect, it } from "vitest";

import {
  daysInGymLine,
  eiffelTowersLine,
  setsPerWorkoutLine,
  workoutsPerWeekLine,
} from "./statTranslations";

describe("workoutsPerWeekLine", () => {
  it("computes rate and elapsed years from the earliest workout", () => {
    // 2,308 workouts over ~9 years ≈ 4.9/week
    const line = workoutsPerWeekLine(
      2308,
      "2017-08-10",
      new Date("2026-08-26T00:00:00Z"),
    );
    expect(line).toBe("4.9 a week for 9 years");
  });

  it("uses singular 'year' after exactly one year", () => {
    const line = workoutsPerWeekLine(
      120,
      "2024-01-01",
      new Date("2025-06-01T00:00:00Z"),
    );
    expect(line).toBe("1.6 a week for 1 year");
  });

  it("returns null with under a year of history", () => {
    expect(
      workoutsPerWeekLine(40, "2026-01-01", new Date("2026-08-01T00:00:00Z")),
    ).toBeNull();
  });

  it("returns null without an earliest date or workouts", () => {
    expect(workoutsPerWeekLine(0, "2017-08-10")).toBeNull();
    expect(workoutsPerWeekLine(100, null)).toBeNull();
  });
});

describe("setsPerWorkoutLine", () => {
  it("rounds to whole sets", () => {
    expect(setsPerWorkoutLine(47_989, 2308)).toBe("21 per workout");
  });

  it("returns null with no workouts", () => {
    expect(setsPerWorkoutLine(100, 0)).toBeNull();
  });
});

describe("eiffelTowersLine", () => {
  it("converts pounds to towers at 10,100 tonnes each", () => {
    expect(eiffelTowersLine(56_800_000)).toBe("≈ 2.6 Eiffel Towers");
  });

  it("hides the comparison below a tenth of a tower", () => {
    expect(eiffelTowersLine(1_000_000)).toBeNull();
  });
});

describe("daysInGymLine", () => {
  it("converts duration to full days", () => {
    // 2,100 hours = 87.5 days
    expect(daysInGymLine(2100 * 3600)).toBe("≈ 88 full days in the gym");
  });

  it("hides the line below one day", () => {
    expect(daysInGymLine(3600)).toBeNull();
  });
});
