import { describe, expect, it } from "vitest";

import type { BookLookupEntry } from "~/components/notion/types";

import { bookSlugFromUrl, humanizeSlug, inlineBookFacts } from "./inlineFacts";

// Noon Pacific, so the formatter's America/Los_Angeles clock cannot roll
// the day.
const MAR_12 = "2025-03-12T19:00:00Z";
const MAR_18 = "2025-03-18T19:00:00Z";
const APR_03 = "2025-04-03T19:00:00Z";

function entry(overrides: Partial<BookLookupEntry> = {}): BookLookupEntry {
  return {
    title: "The Culture Code",
    author: "Daniel Coyle",
    coverUrl: null,
    rating: 5,
    started: null,
    finished: null,
    abandoned: null,
    abandonedAtMin: null,
    audioLengthMin: null,
    pageCount: null,
    hasNotes: true,
    ...overrides,
  };
}

describe("bookSlugFromUrl", () => {
  it("reads the slug out of a bare library URL and nothing else", () => {
    expect(bookSlugFromUrl("https://books.chappyasel.com/range")).toBe("range");
    expect(bookSlugFromUrl("https://books.chappyasel.com/life-3-0/")).toBe(
      "life-3-0",
    );
    expect(bookSlugFromUrl("https://books.chappyasel.com/")).toBeNull();
    expect(bookSlugFromUrl("Read my notes")).toBeNull();
    expect(bookSlugFromUrl("https://example.com/range")).toBeNull();
  });
});

describe("humanizeSlug", () => {
  it("capitalises words but keeps small words lower after the first", () => {
    expect(humanizeSlug("the-culture-code")).toBe("The Culture Code");
    expect(humanizeSlug("start-with-why")).toBe("Start with Why");
    expect(humanizeSlug("range")).toBe("Range");
  });
});

describe("inlineBookFacts", () => {
  it("reports a finished read by its date span", () => {
    expect(inlineBookFacts(entry({ started: MAR_12, finished: MAR_18 }))).toEqual(
      { reading: "Read March 12th - 18th '25", kind: "finished", length: null },
    );
    expect(
      inlineBookFacts(entry({ started: MAR_12, finished: APR_03 })).reading,
    ).toBe("Read Mar 12th - Apr 3rd '25");
  });

  it("names the kind of reading line so a card can pick its glyph", () => {
    expect(inlineBookFacts(entry({ finished: MAR_18 })).kind).toBe("finished");
    expect(inlineBookFacts(entry({ abandoned: MAR_18 })).kind).toBe(
      "abandoned",
    );
    expect(inlineBookFacts(entry({ started: MAR_12 })).kind).toBe("reading");
    expect(inlineBookFacts(entry()).kind).toBeNull();
  });

  it("falls back to the finish date alone when the start is unknown", () => {
    expect(inlineBookFacts(entry({ finished: MAR_18 })).reading).toBe(
      "Read March 18th '25",
    );
  });

  it("prefers the abandonment percentage, then the abandonment date", () => {
    expect(
      inlineBookFacts(
        entry({ abandoned: MAR_18, abandonedAtMin: 120, audioLengthMin: 300 }),
      ).reading,
    ).toBe("Abandoned at 40%");
    expect(inlineBookFacts(entry({ abandoned: MAR_18 })).reading).toBe(
      "Abandoned March 18th '25",
    );
  });

  it("treats a started, unfinished book as in progress", () => {
    expect(inlineBookFacts(entry({ started: MAR_12 })).reading).toBe(
      "Reading since March 12th '25",
    );
  });

  it("lets finished win over a stray abandoned date, and says nothing with no dates", () => {
    expect(
      inlineBookFacts(entry({ finished: MAR_18, abandoned: MAR_12 })).reading,
    ).toBe("Read March 18th '25");
    expect(inlineBookFacts(entry()).reading).toBeNull();
  });

  it("formats whichever length halves exist", () => {
    expect(
      inlineBookFacts(entry({ audioLengthMin: 492, pageCount: 304 })).length,
    ).toBe("8h 12m · ~304 pages");
    expect(inlineBookFacts(entry({ pageCount: 304 })).length).toBe("~304 pages");
    expect(inlineBookFacts(entry()).length).toBeNull();
  });
});
