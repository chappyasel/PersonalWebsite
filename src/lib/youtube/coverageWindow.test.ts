import { describe, expect, it } from "vitest";

import {
  coverageWindow,
  periodKeyOf,
  seriesBounds,
  watchDayOf,
  watchDayOpensAt,
} from "./coverageWindow";

/** An archive Google built at 7 PM Pacific on Sep 12. */
const SEP_12_EVENING_EXPORT = new Date("2026-09-13T02:00:00.000Z");
const NOW = new Date("2026-10-02T19:00:00Z");

describe("watchDayOf", () => {
  it("counts the hours before 4am toward the day before", () => {
    // 3:59 AM and 4:00 AM Pacific on Sep 12.
    expect(watchDayOf(new Date("2026-09-12T10:59:59Z"))).toBe("2026-09-11");
    expect(watchDayOf(new Date("2026-09-12T11:00:00Z"))).toBe("2026-09-12");
  });

  it("reads evening viewing on its Pacific date, not its UTC one", () => {
    expect(watchDayOf(SEP_12_EVENING_EXPORT)).toBe("2026-09-12");
  });

  it("follows daylight saving time", () => {
    // 4:00 AM PST on Mar 7, then 4:00 AM PDT on Mar 8.
    expect(watchDayOf(new Date("2026-03-07T12:00:00Z"))).toBe("2026-03-07");
    expect(watchDayOf(new Date("2026-03-08T10:59:59Z"))).toBe("2026-03-07");
    expect(watchDayOf(new Date("2026-03-08T11:00:00Z"))).toBe("2026-03-08");
  });
});

describe("watchDayOpensAt", () => {
  it("opens at 4am Pacific in either offset", () => {
    expect(watchDayOpensAt("2026-09-12").toISOString()).toBe(
      "2026-09-12T11:00:00.000Z",
    );
    expect(watchDayOpensAt("2026-01-15").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });

  it("lands on the right side of both daylight-saving transitions", () => {
    expect(watchDayOpensAt("2026-03-07").toISOString()).toBe(
      "2026-03-07T12:00:00.000Z",
    );
    expect(watchDayOpensAt("2026-03-08").toISOString()).toBe(
      "2026-03-08T11:00:00.000Z",
    );
    expect(watchDayOpensAt("2026-10-31").toISOString()).toBe(
      "2026-10-31T11:00:00.000Z",
    );
    expect(watchDayOpensAt("2026-11-01").toISOString()).toBe(
      "2026-11-01T12:00:00.000Z",
    );
  });
});

describe("periodKeyOf", () => {
  it("matches Postgres DATE_TRUNC", () => {
    expect(periodKeyOf("2026-09-11", "day")).toBe("2026-09-11");
    // Friday → Monday; a Sunday still belongs to the week before.
    expect(periodKeyOf("2026-09-11", "week")).toBe("2026-09-07");
    expect(periodKeyOf("2026-09-13", "week")).toBe("2026-09-07");
    expect(periodKeyOf("2026-09-14", "week")).toBe("2026-09-14");
    expect(periodKeyOf("2026-09-11", "month")).toBe("2026-09-01");
    expect(periodKeyOf("2026-09-11", "quarter")).toBe("2026-07-01");
    expect(periodKeyOf("2026-12-31", "quarter")).toBe("2026-10-01");
  });
});

describe("coverageWindow", () => {
  it("stops before the watch-day the export was built on", () => {
    // Google built the archive at 7 PM, so anything watched later that
    // evening is missing. Sep 12 is partly exported, not a covered zero.
    const window = coverageWindow({
      coverageThrough: SEP_12_EVENING_EXPORT,
      now: NOW,
      days: null,
    });
    expect(window.lastCoveredDay).toBe("2026-09-11");
    expect(window.closesAt.toISOString()).toBe("2026-09-12T11:00:00.000Z");
  });

  it("spans whole covered watch-days, ending on the last one", () => {
    const window = coverageWindow({
      coverageThrough: SEP_12_EVENING_EXPORT,
      now: NOW,
      days: 30,
    });
    expect(window.firstDay).toBe("2026-08-13");
    expect(window.opensAt?.toISOString()).toBe("2026-08-13T11:00:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2026-09-12T11:00:00.000Z");
  });

  it("covers the whole previous day when the export lands on the 4am boundary", () => {
    const window = coverageWindow({
      coverageThrough: new Date("2026-09-12T11:00:00Z"),
      now: NOW,
      days: 1,
    });
    expect(window.lastCoveredDay).toBe("2026-09-11");
    expect(window.firstDay).toBe("2026-09-11");
  });

  it("keeps a window across a daylight-saving change to whole days", () => {
    const window = coverageWindow({
      coverageThrough: new Date("2026-11-03T20:00:00Z"),
      now: NOW,
      days: 7,
    });
    expect(window.firstDay).toBe("2026-10-27");
    expect(window.opensAt?.toISOString()).toBe("2026-10-27T11:00:00.000Z");
    expect(window.closesAt.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });

  it("measures from now, with nothing covered, before any ingest", () => {
    const window = coverageWindow({
      coverageThrough: null,
      now: NOW,
      days: 30,
    });
    expect(window.lastCoveredDay).toBeNull();
    expect(window.closesAt.toISOString()).toBe("2026-10-02T11:00:00.000Z");
  });
});

describe("seriesBounds", () => {
  it("ends the series on the last covered watch-day", () => {
    const window = coverageWindow({
      coverageThrough: SEP_12_EVENING_EXPORT,
      now: NOW,
      days: 30,
    });
    expect(seriesBounds(window, "day")).toEqual({
      rangeStartKey: "2026-08-13",
      coverageKey: "2026-09-11",
    });
  });

  it("leaves a week the export only reached on Monday morning unfilled", () => {
    // Built 10 AM Monday Sep 14: Sunday Sep 13 is the last covered day.
    const window = coverageWindow({
      coverageThrough: new Date("2026-09-14T17:00:00Z"),
      now: NOW,
      days: 90,
    });
    expect(seriesBounds(window, "week").coverageKey).toBe("2026-09-07");
  });

  it("has no coverage period before any ingest", () => {
    const window = coverageWindow({
      coverageThrough: null,
      now: NOW,
      days: null,
    });
    expect(seriesBounds(window, "day")).toEqual({
      rangeStartKey: null,
      coverageKey: null,
    });
  });
});
