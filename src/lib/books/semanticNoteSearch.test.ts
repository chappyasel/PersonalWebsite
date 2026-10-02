import { describe, expect, it, vi } from "vitest";

import { type NoteSearchHit, rankNoteSearchHits } from "./semanticNoteSearch";

vi.mock("~/server/db", () => ({ db: {} }));

const hit = (
  chunkId: number,
  notionId: string,
  query: string,
  rank: number,
): NoteSearchHit => ({ chunkId, notionId, query, rank });

describe("rankNoteSearchHits", () => {
  it("adds up a passage's ranks across lists and queries", () => {
    const { books } = rankNoteSearchHits(
      [
        hit(1, "a", "what is trust", 0),
        hit(1, "a", "what is trust", 4),
        hit(1, "a", "how trust breaks", 2),
        hit(2, "b", "what is trust", 1),
      ],
      { maxBooks: 10, maxPassagesPerBook: 3 },
    );
    expect(books.map((book) => book.notionId)).toEqual(["a", "b"]);
    expect(books[0]!.passages[0]).toEqual({
      chunkId: 1,
      score: 1 / 61 + 1 / 65 + 1 / 63,
      queries: ["what is trust", "how trust breaks"],
    });
  });

  it("ranks a book with several good passages above one lucky hit", () => {
    const { books } = rankNoteSearchHits(
      [
        hit(1, "lucky", "trust", 0),
        hit(2, "deep", "trust", 1),
        hit(3, "deep", "trust", 2),
        hit(4, "deep", "trust", 3),
      ],
      { maxBooks: 10, maxPassagesPerBook: 3 },
    );
    expect(books.map((book) => book.notionId)).toEqual(["deep", "lucky"]);
  });

  it("caps books and passages but counts every candidate book", () => {
    const result = rankNoteSearchHits(
      [
        hit(1, "a", "q", 0),
        hit(2, "a", "q", 1),
        hit(3, "a", "q", 2),
        hit(4, "b", "q", 3),
        hit(5, "c", "q", 4),
      ],
      { maxBooks: 2, maxPassagesPerBook: 2 },
    );
    expect(result.candidateBooks).toBe(3);
    expect(result.books.map((book) => book.notionId)).toEqual(["a", "b"]);
    expect(result.books[0]!.passages.map((passage) => passage.chunkId)).toEqual(
      [1, 2],
    );
  });
});
