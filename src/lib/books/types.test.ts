import { describe, expect, it } from "vitest";

import { abandonedPercent, isCurrentlyReading, readingStatus } from "./types";

describe("readingStatus", () => {
  it("reads started-only as reading", () => {
    expect(
      readingStatus({ started: "2026-08-21", finished: null, abandoned: null }),
    ).toBe("reading");
  });

  it("reads an abandoned date as abandoned, not reading", () => {
    expect(
      readingStatus({
        started: "2026-08-21",
        finished: null,
        abandoned: "2026-08-25",
      }),
    ).toBe("abandoned");
    expect(
      isCurrentlyReading({
        started: "2026-08-21",
        finished: null,
        abandoned: "2026-08-25",
      }),
    ).toBe(false);
  });

  it("lets finished win over a contradictory abandoned date", () => {
    expect(
      readingStatus({
        started: "2026-08-21",
        finished: "2026-08-25",
        abandoned: "2026-08-25",
      }),
    ).toBe("finished");
  });

  it("returns null for a book with no dates", () => {
    expect(
      readingStatus({ started: null, finished: null, abandoned: null }),
    ).toBeNull();
  });
});

describe("abandonedPercent", () => {
  it("rounds the listened fraction to a whole percent", () => {
    // Children of Time: 8h21m of 16h31m
    expect(abandonedPercent({ abandonedAtMin: 501, audioLengthMin: 991 })).toBe(
      51,
    );
  });

  it("returns null without a position or without a runtime", () => {
    expect(
      abandonedPercent({ abandonedAtMin: null, audioLengthMin: 991 }),
    ).toBeNull();
    expect(
      abandonedPercent({ abandonedAtMin: 501, audioLengthMin: null }),
    ).toBeNull();
  });

  it("clamps an overshooting position to 100", () => {
    expect(
      abandonedPercent({ abandonedAtMin: 1200, audioLengthMin: 991 }),
    ).toBe(100);
  });

  it("treats minute zero as a real position", () => {
    expect(abandonedPercent({ abandonedAtMin: 0, audioLengthMin: 991 })).toBe(
      0,
    );
  });
});
