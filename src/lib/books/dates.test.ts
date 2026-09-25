import { describe, expect, it } from "vitest";

import { notionDateToInstant } from "./dates";

describe("notionDateToInstant", () => {
  it("reads a summer Notion date as Pacific daylight midnight", () => {
    expect(notionDateToInstant("2026-09-23").toISOString()).toBe(
      "2026-09-23T07:00:00.000Z",
    );
  });

  it("reads a winter Notion date as Pacific standard midnight", () => {
    expect(notionDateToInstant("2026-01-15").toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });

  it("uses the offset in force at midnight on the days the clocks change", () => {
    // Daylight time starts at 2am on Mar 8 and ends at 2am on Nov 1, 2026.
    expect(notionDateToInstant("2026-03-08").toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(notionDateToInstant("2026-11-01").toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });

  it("keeps a date that carries its own time", () => {
    expect(
      notionDateToInstant("2026-09-23T21:30:00.000-07:00").toISOString(),
    ).toBe("2026-09-24T04:30:00.000Z");
  });
});
