import { describe, expect, it } from "vitest";

import {
  formatValueUnit,
  ordinalDate,
  shortenValue,
  slashDate,
  toBackgroundColor,
  toTextColor,
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
