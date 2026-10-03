import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import "server-only";

import type { Book } from "~/lib/books/types";
import { db } from "~/server/db";

import { BOOKS_DATA_TAG, BOOKS_REVALIDATE_SECONDS } from "./books";

/** A book listed under another as related: what its row draws. */
export type RelatedBook = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "publicationYear"
  | "coverUrl"
  | "coverColor"
  | "rating"
  | "started"
  | "finished"
>;

/** One of a book's nearest books by note centroid, nearest first. */
export type RelatedNeighbour = {
  bookId: string;
  relatedId: string;
  similarity: number;
};

/** A reading as the related-books rules read it. */
export type RelatedCandidate = RelatedBook & {
  /** Dropped and never finished. The shelf hides these, so this does too. */
  abandoned: boolean;
};

/** The most books a book's page lists as related. */
export const RELATED_BOOKS_LIMIT = 5;

/**
 * The least cosine similarity between two books' note centroids for one to
 * be listed under the other. Measured on the library of 2026-10-02
 * (voyage-4-large, 276 books with notes): the median book's fifth-nearest
 * book sits at 0.71 and unrelated pairs at 0.52, and the pairs between 0.55
 * and 0.60 read as weak (The Elements of Style to Rework, Masters of Greek
 * Thought to 48 Laws of Power). At 0.60, 263 books keep all five and two
 * books with a paragraph of notes list none. A new NOTE_EMBEDDING_MODEL
 * moves the whole scale, so retune this with it.
 */
export const RELATED_BOOKS_MIN_SIMILARITY = 0.6;

/**
 * Nearest books fetched per book, enough to fill five after the rules below
 * skip other readings of the same book and abandoned attempts.
 */
const NEIGHBOURS_PER_BOOK = 12;

// The key getBooks groups readings by: one work, however many reads.
const workKey = (book: Pick<Book, "title" | "author">) =>
  `${book.title.toLowerCase()}|||${book.author.toLowerCase()}`;

/**
 * Turn each book's nearest neighbours into the list its page shows: closest
 * first, at most `limit`, none under `minSimilarity`, never another reading
 * of the book itself, one reading per other book (its closest), and no
 * abandoned attempts. Books left with nothing are absent. Pure, for testing.
 */
export function shapeRelatedBooks(
  neighbours: RelatedNeighbour[],
  candidates: RelatedCandidate[],
  options: { limit: number; minSimilarity: number },
): Record<string, RelatedBook[]> {
  const byId = new Map(candidates.map((book) => [book.id, book]));
  const nearest = new Map<string, RelatedNeighbour[]>();
  for (const neighbour of neighbours) {
    const list = nearest.get(neighbour.bookId) ?? [];
    list.push(neighbour);
    nearest.set(neighbour.bookId, list);
  }

  const related: Record<string, RelatedBook[]> = {};
  for (const [bookId, list] of nearest) {
    const book = byId.get(bookId);
    if (!book) continue;
    list.sort(
      (a, b) =>
        b.similarity - a.similarity || a.relatedId.localeCompare(b.relatedId),
    );
    const listed = new Set([workKey(book)]);
    const rows: RelatedBook[] = [];
    for (const neighbour of list) {
      if (rows.length === options.limit) break;
      if (neighbour.similarity < options.minSimilarity) break;
      const other = byId.get(neighbour.relatedId);
      if (!other || other.abandoned || listed.has(workKey(other))) continue;
      listed.add(workKey(other));
      rows.push({
        id: other.id,
        title: other.title,
        author: other.author,
        publicationYear: other.publicationYear,
        coverUrl: other.coverUrl,
        coverColor: other.coverColor,
        rating: other.rating,
        started: other.started,
        finished: other.finished,
      });
    }
    if (rows.length) related[bookId] = rows;
  }
  return related;
}

/**
 * Every book's related books, from the meaning of its notes: each book is
 * the average of its note passages' embeddings, and books are compared by
 * cosine similarity. A book without written notes has no passages, so it
 * neither gets a list nor appears in one. One query covers the library
 * (about 120 ms warm on Neon, 2 s cold), which is why the result is cached
 * whole rather than per book.
 */
export async function loadRelatedBooks(): Promise<
  Record<string, RelatedBook[]>
> {
  const [neighbourRows, candidates] = await Promise.all([
    db.execute(sql`
      WITH centroids AS (
        SELECT c.notion_id, avg(c.embedding) AS centroid
        FROM book_note_chunks c
        GROUP BY c.notion_id
      ),
      shelf AS (
        SELECT b.id, x.centroid
        FROM books b
        JOIN centroids x ON x.notion_id = b.notion_id
      )
      SELECT s.id AS book_id, n.id AS related_id, n.similarity
      FROM shelf s
      CROSS JOIN LATERAL (
        SELECT o.id, 1 - (o.centroid <=> s.centroid) AS similarity
        FROM shelf o
        WHERE o.id <> s.id
        ORDER BY o.centroid <=> s.centroid, o.id
        LIMIT ${NEIGHBOURS_PER_BOOK}
      ) n`),
    db.query.books.findMany({
      columns: {
        id: true,
        title: true,
        author: true,
        publicationYear: true,
        coverUrl: true,
        coverColor: true,
        rating: true,
        started: true,
        finished: true,
        abandoned: true,
      },
    }),
  ]);
  const neighbours = (
    neighbourRows as unknown as Array<{
      book_id: string;
      related_id: string;
      similarity: number | string;
    }>
  ).map((row) => ({
    bookId: row.book_id,
    relatedId: row.related_id,
    similarity: Number(row.similarity),
  }));
  return shapeRelatedBooks(
    neighbours,
    candidates.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      publicationYear: book.publicationYear ?? null,
      coverUrl: book.coverUrl,
      coverColor: book.coverColor ?? null,
      rating: book.rating ?? null,
      started: book.started?.toISOString() ?? null,
      finished: book.finished?.toISOString() ?? null,
      abandoned: Boolean(book.abandoned && !book.finished),
    })),
    {
      limit: RELATED_BOOKS_LIMIT,
      minSimilarity: RELATED_BOOKS_MIN_SIMILARITY,
    },
  );
}

/**
 * The whole library's lists, cached like the shelf: a sync that changes
 * books rebuilds note passages first, then revalidates BOOKS_DATA_TAG.
 */
export const getCachedRelatedBooks = unstable_cache(
  loadRelatedBooks,
  ["related-books"],
  { revalidate: BOOKS_REVALIDATE_SECONDS, tags: [BOOKS_DATA_TAG] },
);

/** The books listed as related on one book's page, closest first. */
export async function getRelatedBooks(bookId: string): Promise<RelatedBook[]> {
  return (await getCachedRelatedBooks())[bookId] ?? [];
}
