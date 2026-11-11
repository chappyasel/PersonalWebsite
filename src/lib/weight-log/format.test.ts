import { describe, expect, it } from "vitest";

import { rate, weekLabel } from "./format";

describe("rate", () => {
  it.each([
    [0.3, "+0.3"],
    [0.333333, "+0.3"],
    [0.25, "+0.3"],
    [-0.25, "−0.3"],
    [-0.05, "−0.1"],
    [0.04, "0.0"],
    [-0.04, "0.0"],
    [0, "0.0"],
    [1, "+1.0"],
    [-1.5, "−1.5"],
    [null, "—"],
  ])("writes %s as %s, to one decimal with its sign", (value, text) => {
    expect(rate(value)).toBe(text);
  });
});

describe("weekLabel", () => {
  it("adds the year only when it isn't today's, unless told not to", () => {
    expect(weekLabel("2030-12-30", "2030-12-31")).toBe("Dec 30");
    expect(weekLabel("2031-01-06", "2030-12-31")).toBe("Jan 6, 2031");
    expect(weekLabel("2031-01-06", "2030-12-31", { year: false })).toBe(
      "Jan 6",
    );
  });
});
