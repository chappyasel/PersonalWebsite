import { describe, expect, it } from "vitest";

import { formatReadDates, formatSingleReadDate } from "./format";

describe("book date formatting", () => {
  // The sync stores a Notion date as that day's Pacific midnight
  // (notionDateToInstant), 07:00 UTC in June, and the pages read it back as
  // the same Pacific day whatever zone the server builds in.
  it("shows the Notion dates, read as Pacific days, during UTC production builds", () => {
    expect(
      formatReadDates("2023-06-16T07:00:00.000Z", "2023-06-18T07:00:00.000Z"),
    ).toBe("Jun 16th - 18th '23");
  });

  it("formats a single read date as the same Pacific day", () => {
    expect(formatSingleReadDate("2023-06-16T07:00:00.000Z")).toBe(
      "Jun 16th '23",
    );
  });
});
