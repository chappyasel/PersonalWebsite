import { describe, expect, it } from "vitest";

import { normalizeSearchText, rankSearchCandidates } from "./ranking";

describe("Universal Search ranking", () => {
  it("normalizes case, diacritics, punctuation, apostrophes, and whitespace", () => {
    expect(normalizeSearchText("  Chappy’s  Café: Notes! ")).toBe(
      "chappys cafe notes",
    );
  });

  it("orders identity, aliases, metadata, then body text", () => {
    const ranked = rankSearchCandidates("habits", [
      {
        id: "body",
        label: "Unrelated title",
        body: "Notes about habits and systems",
      },
      {
        id: "metadata",
        label: "A book",
        metadata: ["habits"],
      },
      {
        id: "alias",
        label: "Routine",
        aliases: ["habits"],
      },
      { id: "prefix", label: "Habits at work" },
      { id: "exact", label: "Habits" },
    ]);

    expect(ranked.map((candidate) => candidate.id)).toEqual([
      "exact",
      "prefix",
      "alias",
      "metadata",
      "body",
    ]);
    expect(ranked.map((candidate) => candidate.matchKind)).toEqual([
      "exact",
      "prefix",
      "alias",
      "metadata",
      "body",
    ]);
  });

  it("keeps source order as the deterministic tie breaker", () => {
    const ranked = rankSearchCandidates("book", [
      { id: "first", label: "Book alpha" },
      { id: "second", label: "Book beta" },
    ]);

    expect(ranked.map((candidate) => candidate.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("omits candidates that do not match", () => {
    expect(
      rankSearchCandidates("missing", [{ id: "home", label: "Home" }]),
    ).toEqual([]);
  });
});
