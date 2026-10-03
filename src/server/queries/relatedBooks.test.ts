import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RELATED_BOOKS_LIMIT,
  RELATED_BOOKS_MIN_SIMILARITY,
  type RelatedCandidate,
  type RelatedNeighbour,
  getRelatedBooks,
  loadRelatedBooks,
  shapeRelatedBooks,
} from "./relatedBooks";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), books: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({
  db: {
    execute: mocks.execute,
    select: () => ({ from: mocks.books }),
  },
}));
afterEach(() => vi.resetAllMocks());

function book(
  id: string,
  overrides: Partial<RelatedCandidate> = {},
): RelatedCandidate {
  return {
    id,
    title: id,
    author: "Author",
    publicationYear: 2000,
    coverUrl: `https://covers.example/${id}.jpg`,
    coverColor: "#335577",
    abandoned: false,
    ...overrides,
  };
}

const near = (
  bookId: string,
  relatedId: string,
  similarity: number,
): RelatedNeighbour => ({ bookId, relatedId, similarity });

const OPTIONS = { limit: 3, minSimilarity: 0.6 };
const ids = (related: Record<string, Array<{ id: string }>>, bookId: string) =>
  related[bookId]?.map((entry) => entry.id);

describe("shapeRelatedBooks", () => {
  it("lists the closest books first, up to the limit", () => {
    const related = shapeRelatedBooks(
      [
        near("a", "c", 0.7),
        near("a", "b", 0.8),
        near("a", "e", 0.65),
        near("a", "d", 0.75),
      ],
      ["a", "b", "c", "d", "e"].map((id) => book(id)),
      OPTIONS,
    );
    expect(ids(related, "a")).toEqual(["b", "d", "c"]);
  });

  it("stops at the similarity floor", () => {
    const related = shapeRelatedBooks(
      [near("a", "b", 0.61), near("a", "c", 0.6), near("a", "d", 0.59)],
      ["a", "b", "c", "d"].map((id) => book(id)),
      OPTIONS,
    );
    expect(ids(related, "a")).toEqual(["b", "c"]);
  });

  it("never lists another reading of the book itself", () => {
    const related = shapeRelatedBooks(
      [near("habits", "habits-reread", 0.95), near("habits", "b", 0.7)],
      [
        book("habits", { title: "Atomic Habits", author: "James Clear" }),
        book("habits-reread", {
          title: "atomic habits",
          author: "JAMES CLEAR",
        }),
        book("b"),
      ],
      OPTIONS,
    );
    expect(ids(related, "habits")).toEqual(["b"]);
  });

  it("lists one reading of another book, its closest", () => {
    const related = shapeRelatedBooks(
      [
        near("a", "body-2", 0.8),
        near("a", "body-1", 0.79),
        near("a", "c", 0.7),
      ],
      [
        book("a"),
        book("body-1", { title: "The Body" }),
        book("body-2", { title: "The Body" }),
        book("c"),
      ],
      OPTIONS,
    );
    expect(ids(related, "a")).toEqual(["body-2", "c"]);
  });

  it("skips an abandoned attempt but keeps a finished read of that book", () => {
    const related = shapeRelatedBooks(
      [
        near("a", "dropped", 0.9),
        near("a", "finished", 0.8),
        near("a", "c", 0.7),
      ],
      [
        book("a"),
        book("dropped", { title: "Dune", abandoned: true }),
        book("finished", { title: "Dune" }),
        book("c"),
      ],
      OPTIONS,
    );
    expect(ids(related, "a")).toEqual(["finished", "c"]);
  });

  it("leaves out a book with nothing close enough", () => {
    const related = shapeRelatedBooks(
      [near("thin", "b", 0.55), near("b", "thin", 0.55)],
      [book("thin"), book("b")],
      OPTIONS,
    );
    expect(related).toEqual({});
  });

  it("draws each row from the reading's own fields, and nothing else", () => {
    const related = shapeRelatedBooks(
      [near("a", "b", 0.9)],
      [book("a"), book("b", { publicationYear: null, coverColor: null })],
      OPTIONS,
    );
    expect(related.a).toEqual([
      {
        id: "b",
        title: "b",
        author: "Author",
        publicationYear: null,
        coverUrl: "https://covers.example/b.jpg",
        coverColor: null,
      },
    ]);
  });
});

describe("loadRelatedBooks", () => {
  it("compares books by the average of their passage embeddings", async () => {
    mocks.execute.mockResolvedValue([]);
    mocks.books.mockResolvedValue([]);
    await loadRelatedBooks();
    const query = new PgDialect().sqlToQuery(
      mocks.execute.mock.calls[0]![0] as SQL,
    );
    expect(query.sql).toContain("avg(c.embedding)");
    expect(query.sql).toContain("o.centroid <=> s.centroid");
  });

  it("applies the shipped limit and floor to every book", async () => {
    const others = Array.from({ length: 8 }, (_, index) => `b${index}`);
    mocks.execute.mockResolvedValue([
      // postgres-js can hand back a float as text; it is compared as a number.
      ...others.map((id, index) => ({
        book_id: "a",
        related_id: id,
        similarity: String(0.9 - index * 0.01),
      })),
      { book_id: "thin", related_id: "b0", similarity: "0.61" },
      {
        book_id: "thin",
        related_id: "b1",
        similarity: String(RELATED_BOOKS_MIN_SIMILARITY - 0.01),
      },
    ]);
    mocks.books.mockResolvedValue(
      ["a", "thin", ...others].map((id) => book(id)),
    );

    const related = await loadRelatedBooks();

    expect(ids(related, "a")).toEqual(others.slice(0, RELATED_BOOKS_LIMIT));
    expect(ids(related, "thin")).toEqual(["b0"]);
  });

  it("gives a book without a list none", async () => {
    mocks.execute.mockResolvedValue([
      { book_id: "a", related_id: "b", similarity: 0.8 },
    ]);
    mocks.books.mockResolvedValue([book("a"), book("b")]);

    expect((await getRelatedBooks("a")).map((entry) => entry.id)).toEqual([
      "b",
    ]);
    expect(await getRelatedBooks("unwritten")).toEqual([]);
  });
});
