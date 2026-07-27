import { describe, expect, it } from "vitest";

import { formatReadDates, formatSingleReadDate } from "./format";

describe("book date formatting", () => {
  it("uses Pacific calendar dates consistently during UTC production builds", () => {
    expect(
      formatReadDates("2023-06-16T00:00:00.000Z", "2023-06-18T00:00:00.000Z"),
    ).toBe("June 15th - 17th '23");
  });

  it("formats a single read date with the same Pacific calendar date", () => {
    expect(formatSingleReadDate("2023-06-16T00:00:00.000Z")).toBe(
      "June 15th '23",
    );
  });
});
