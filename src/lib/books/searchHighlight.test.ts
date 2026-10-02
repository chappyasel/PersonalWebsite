// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { findTermRanges, highlightTerms, wordStem } from "./searchHighlight";

describe("highlightTerms", () => {
  it("drops stopwords and cuts words to a stem", () => {
    expect(highlightTerms("The habits of trusting people")).toEqual([
      "habit",
      "trust",
      "people",
    ]);
  });

  it("keeps a short word whole rather than over-cutting it", () => {
    expect(highlightTerms("uses")).toEqual(["uses"]);
    expect(highlightTerms("AI ethics")).toEqual(["ai", "ethic"]);
  });

  it("bounds what a hand-written ?hl= can ask for", () => {
    const many = Array.from({ length: 50 }, (_, index) => `word${index}`);
    expect(highlightTerms(many.join(" "))).toHaveLength(8);
    expect(highlightTerms(`${"a".repeat(300)} trust`)).not.toContain("trust");
  });
});

describe("wordStem", () => {
  it("cuts plain suffixes and leaves endings that belong to the word", () => {
    expect(
      ["trusting", "trusted", "trusts", "classes", "boxes", "cities"].map(
        wordStem,
      ),
    ).toEqual(["trust", "trust", "trust", "class", "box", "city"]);
    expect(
      ["string", "evening", "speed", "news", "notes"].map(wordStem),
    ).toEqual(["string", "evening", "speed", "news", "note"]);
  });
});

describe("findTermRanges", () => {
  function mark(html: string, query: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    return findTermRanges(root, highlightTerms(query)).map((range) =>
      range.toString(),
    );
  }

  it("marks whole words that share a stem with a term, across elements", () => {
    expect(
      mark(
        "<p>Trust is built.</p><ul><li><strong>Trusting</strong> teams; mistrust spreads</li></ul>",
        "trust",
      ),
    ).toEqual(["Trust", "Trusting"]);
  });

  it("does not mark unrelated words that only start the same way", () => {
    expect(mark("<p>Strong strings beat stress</p>", "string")).toEqual([
      "strings",
    ]);
    expect(
      mark("<p>Nothing notable in my notes, not one</p>", "notes"),
    ).toEqual(["notes"]);
    expect(mark("<p>Even the evening event</p>", "evening")).toEqual([
      "evening",
    ]);
  });

  it("skips screen-reader-only labels", () => {
    expect(
      mark(
        '<h3>Habits <span class="sr-only">Copy link to habits</span></h3>',
        "habits",
      ),
    ).toEqual(["Habits"]);
  });

  it("marks nothing for a query of stopwords", () => {
    expect(mark("<p>The book is about it</p>", "the it")).toEqual([]);
  });
});
