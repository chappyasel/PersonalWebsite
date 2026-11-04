import { unstable_cache } from "next/cache";
import "server-only";

import { type NoteBookLink, bookLinksInNotes } from "~/lib/books/noteBookLinks";
import type { NoteExcerptSegment } from "~/lib/books/notesSearch";
import { notionPageIdsIn } from "~/lib/books/notionLinks";
import type { Book } from "~/lib/books/types";
import { db } from "~/server/db";

import { BOOKS_DATA_TAG, BOOKS_REVALIDATE_SECONDS } from "./books";

/** A book whose notes link to another book: what its row draws. */
export type BookBacklink = Pick<
  Book,
  "id" | "title" | "author" | "publicationYear" | "coverUrl" | "coverColor"
> & {
  /** The citing book's chapter or takeaway that holds the link. */
  anchor: string | null;
  /** The line holding the link, the link's words marked. */
  excerpt: NoteExcerptSegment[];
  /** The link's words, marked in the citing book's notes on arrival. */
  linkText: string;
};

/** A reading as the backlink rules read it. */
export type BacklinkReading = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "publicationYear"
  | "coverUrl"
  | "coverColor"
  | "started"
  | "finished"
> & {
  notionId: string;
  notes: string | null;
  /** Dropped and never finished. The shelf hides these, so this does too. */
  abandoned: boolean;
};

// The key getBooks groups readings by: one work, however many reads.
const workKey = (book: Pick<Book, "title" | "author">) =>
  `${book.title.toLowerCase()}|||${book.author.toLowerCase()}`;

const BOOK_SLUG = /books\.chappyasel\.com\/([a-z0-9-]+)/;

// The later of two readings of one work.
const readAt = (book: Pick<Book, "started" | "finished">) =>
  book.finished ?? book.started ?? "";

/**
 * Every book's backlinks: the other books whose notes link to it. One row
 * per citing book however many times or readings it links, from its most
 * recent reading that does, at that reading's first link. A link to any
 * reading of a book counts for all its readings, and a reading never cites
 * its own book. Rows run newest reading first. Pure, for testing.
 */
export function collectBookBacklinks(
  readings: BacklinkReading[],
): Record<string, BookBacklink[]> {
  const byId = new Map(readings.map((book) => [book.id, book]));
  const idByNotionId = new Map(
    readings.map((book) => [book.notionId, book.id]),
  );
  const resolve = (href: string) => {
    const notionId = notionPageIdsIn(href)[0];
    if (notionId) return idByNotionId.get(notionId) ?? null;
    const slug = BOOK_SLUG.exec(href)?.[1];
    return slug && byId.has(slug) ? slug : null;
  };
  const linksSomeBook = (notes: string) =>
    notionPageIdsIn(notes).some((id) => idByNotionId.has(id)) ||
    BOOK_SLUG.test(notes);

  // Cited work, then citing work, to the citing reading and its link.
  type Citation = { reading: BacklinkReading; link: NoteBookLink };
  const citations = new Map<string, Map<string, Citation>>();
  for (const reading of readings) {
    if (reading.abandoned || !reading.notes || !linksSomeBook(reading.notes))
      continue;
    const citing = workKey(reading);
    for (const link of bookLinksInNotes(reading.notes, resolve)) {
      const cited = byId.get(link.bookId);
      if (!cited || workKey(cited) === citing) continue;
      const byCiting =
        citations.get(workKey(cited)) ?? new Map<string, Citation>();
      citations.set(workKey(cited), byCiting);
      const held = byCiting.get(citing);
      if (!held || readAt(reading) > readAt(held.reading))
        byCiting.set(citing, { reading, link });
    }
  }

  const backlinks: Record<string, BookBacklink[]> = {};
  for (const book of readings) {
    const byCiting = citations.get(workKey(book));
    if (!byCiting) continue;
    backlinks[book.id] = [...byCiting.values()]
      .sort(
        (a, b) =>
          readAt(b.reading).localeCompare(readAt(a.reading)) ||
          a.reading.id.localeCompare(b.reading.id),
      )
      .map(({ reading, link }) => ({
        id: reading.id,
        title: reading.title,
        author: reading.author,
        publicationYear: reading.publicationYear,
        coverUrl: reading.coverUrl,
        coverColor: reading.coverColor,
        anchor: link.anchor,
        excerpt: link.excerpt,
        linkText: link.text,
      }));
  }
  return backlinks;
}

/**
 * Every book's backlinks, read from the notes as synced. Only notes that
 * link a library book are parsed (about 30 of 280), so a rebuild is one
 * read of the notes and a few hundred milliseconds of Markdown.
 */
export async function loadBookBacklinks(): Promise<
  Record<string, BookBacklink[]>
> {
  const rows = await db.query.books.findMany({
    columns: {
      id: true,
      notionId: true,
      title: true,
      author: true,
      publicationYear: true,
      coverUrl: true,
      coverColor: true,
      started: true,
      finished: true,
      abandoned: true,
      notes: true,
    },
  });
  return collectBookBacklinks(
    rows.map((book) => ({
      id: book.id,
      notionId: book.notionId,
      title: book.title,
      author: book.author,
      publicationYear: book.publicationYear ?? null,
      coverUrl: book.coverUrl,
      coverColor: book.coverColor ?? null,
      started: book.started?.toISOString() ?? null,
      finished: book.finished?.toISOString() ?? null,
      abandoned: Boolean(book.abandoned && !book.finished),
      notes: book.notes,
    })),
  );
}

/** The whole library's backlinks, cached like the shelf and rebuilt with
 * it when a sync revalidates BOOKS_DATA_TAG. */
export const getCachedBookBacklinks = unstable_cache(
  loadBookBacklinks,
  ["book-backlinks"],
  { revalidate: BOOKS_REVALIDATE_SECONDS, tags: [BOOKS_DATA_TAG] },
);

/** The books whose notes link to this one, newest reading first. */
export async function getBookBacklinks(
  bookId: string,
): Promise<BookBacklink[]> {
  return (await getCachedBookBacklinks())[bookId] ?? [];
}
