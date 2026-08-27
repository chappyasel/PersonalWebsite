import { describe, expect, it } from "vitest";

import {
  formatClockDuration,
  formatValueUnit,
  ordinalDate,
  shortenValue,
  slashDate,
  splitShortened,
  toBackgroundColor,
  toTextColor,
  wlaSetDescription,
  workoutDateLabel,
} from "./wlaFormat";

describe("shortenValue", () => {
  it("passes small values through without separators", () => {
    expect(shortenValue(999.5)).toBe("999.5");
    expect(shortenValue(451)).toBe("451");
  });

  it("shortens thousands to 3 significant digits with k", () => {
    expect(shortenValue(12_345.12)).toBe("12.3k");
    expect(shortenValue(41_000)).toBe("41k");
    expect(shortenValue(7_025_017)).toBe("7.03m");
  });
});

describe("formatValueUnit", () => {
  it("depluralizes at exactly one", () => {
    expect(formatValueUnit(1, "reps")).toBe("1 rep");
    expect(formatValueUnit(24, "reps")).toBe("24 reps");
    expect(formatValueUnit(1, "sets")).toBe("1 set");
  });

  it("shortens with the unit attached", () => {
    expect(formatValueUnit(12_300, "lbs")).toBe("12.3k lbs");
  });
});

describe("ordinalDate", () => {
  it("renders app-style ordinal dates", () => {
    expect(ordinalDate("2026-06-14")).toBe("Jun 14th '26");
    expect(ordinalDate("2017-06-27")).toBe("Jun 27th '17");
    expect(ordinalDate("2025-03-01")).toBe("Mar 1st '25");
    expect(ordinalDate("2025-03-22")).toBe("Mar 22nd '25");
    expect(ordinalDate("2025-03-13")).toBe("Mar 13th '25");
  });
});

describe("slashDate", () => {
  it("renders the graph axis format", () => {
    expect(slashDate("2017-07-21")).toBe("7/21/17");
  });
});

describe("color transforms", () => {
  it("lightens saturated category colors into pastels", () => {
    // Chest #039BE5: L≈45.5, S≈97 → light bg L=90, S=57
    const bg = toBackgroundColor("#039BE5");
    expect(bg.light).toMatch(/^hsl\(\d+, 5\d%, 90%\)$/);
    const text = toTextColor("#039BE5");
    expect(text.light).toMatch(/^hsl\(\d+, 9\d%, 4\d%\)$/);
  });
});

describe("workoutDateLabel", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  it("uses the long weekday form within 60 days", () => {
    expect(workoutDateLabel("2026-08-13T17:30", now)).toBe(
      "Thursday, August 13th",
    );
  });
  it("switches to the short weekday + year form after 60 days", () => {
    expect(workoutDateLabel("2025-08-01T09:00", now)).toBe("Fri, Aug 1st '25");
  });
});

describe("formatClockDuration", () => {
  it("renders minutes unpadded and seconds padded", () => {
    expect(formatClockDuration(302)).toBe("5:02");
    expect(formatClockDuration(3930)).toBe("1:05:30");
  });
  it("keeps fractional seconds instead of rounding", () => {
    expect(formatClockDuration(59.5)).toBe("0:59.5");
  });
});

describe("wlaSetDescription", () => {
  const base = {
    reps: null,
    weight: null,
    durationSeconds: null,
    distance: null,
    calories: null,
    custom: null,
  };
  it("keeps decimals on reps_weight", () => {
    expect(
      wlaSetDescription({ ...base, reps: 5, weight: 187.5 }, "reps_weight"),
    ).toBe("5x187.5");
  });
  it("formats the non-lift styles per the app", () => {
    expect(wlaSetDescription({ ...base, reps: 1 }, "reps")).toBe("1 rep");
    expect(
      wlaSetDescription({ ...base, durationSeconds: 45 }, "duration_secs"),
    ).toBe("45 secs");
    expect(
      wlaSetDescription(
        { ...base, durationSeconds: 45, weight: 25 },
        "duration_secs_weight",
      ),
    ).toBe("45s (25)");
    expect(
      wlaSetDescription(
        { ...base, durationSeconds: 2730, distance: 3.1, calories: 350 },
        "duration_dist_cals",
      ),
    ).toBe("45:30, 3.1 mi (350 cals)");
    expect(wlaSetDescription({ ...base, custom: "AMRAP" }, "custom")).toBe(
      "AMRAP",
    );
    expect(
      wlaSetDescription(
        { ...base, durationSeconds: 60, calories: 1 },
        "duration_cals",
      ),
    ).toBe("1:00 (1 cal)");
  });
});

describe("splitShortened", () => {
  it("splits the multiplier suffix off for small-cap styling", () => {
    expect(splitShortened(23_400)).toEqual({ main: "23.4", suffix: "k" });
    expect(splitShortened(999)).toEqual({ main: "999", suffix: "" });
  });
});
