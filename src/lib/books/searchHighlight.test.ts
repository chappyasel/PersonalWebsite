// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { findTermRanges, highlightTerms } from "./searchHighlight";

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
});

describe("findTermRanges", () => {
  function mark(html: string, query: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    return findTermRanges(root, highlightTerms(query)).map((range) =>
      range.toString(),
    );
  }

  it("marks whole words that start with a term, across elements", () => {
    expect(
      mark(
        "<p>Trust is built.</p><ul><li><strong>Trusting</strong> teams; mistrust spreads</li></ul>",
        "trust",
      ),
    ).toEqual(["Trust", "Trusting"]);
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
