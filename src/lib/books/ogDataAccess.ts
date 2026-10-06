/**
 * Edge-compatible database access for OG image generation
 * Cannot use tRPC in edge runtime, so we use direct database queries
 */
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { books } from "~/server/db/schema";

import { findBookById } from "./bookLookup";
import { linkNotesToLibrary } from "./inlineLookup";
import type { LinkPreviews } from "./linkPreview";
import { withoutPlaceholders } from "./markdown";
import type { BaseBook, BookReading, BookWithNotes } from "./types";

/**
 * Fetch a book by ID for OG image generation
 * This is edge-runtime compatible (no tRPC)
 *
 * @param bookId - The book's current or legacy slug
 * @returns The book with tags
 * @throws Error if book not found
 */
export async function getBookForOG(
  bookId: string,
): Promise<BaseBook & { coverColor: string | null }> {
  const book = await findBookById(bookId);

  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  // Transform database result to Book type
  return {
    id: book.id,
    notionId: book.notionId,
    title: book.title,
    author: book.author,
    publicationYear: book.publicationYear,
    started: book.started?.toISOString() ?? null,
    finished: book.finished?.toISOString() ?? null,
    abandoned: book.abandoned?.toISOString() ?? null,
    abandonedAtMin: book.abandonedAtMin,
    rating: book.rating,
    audioLengthMin: book.audioLengthMin,
    pageCount: book.pageCount,
    tags: book.tags.map((t) => t.tagName),
    hasNotes: book.hasNotes,
    hasSummary: book.hasSummary,
    isAutomated: book.isAutomated,
    isFeatured: book.isFeatured,
    coverUrl: book.coverUrl,
    coverColor: book.coverColor ?? null,
    audibleUrl: book.audibleUrl,
    notionUrl: book.notionUrl,
  };
}

/**
 * Fetch a book by ID with full notes for server-side rendering
 * This is used by the book detail page to pre-fetch data
 *
 * @param bookId - The book's slug ID
 * @param options.staticPage - The ISR page asks: its HTML lasts a day, so it
 *   waits longer for link previews than a tRPC request does
 * @returns The book with tags and notes, or null if not found
 */
export async function getBookWithNotes(
  bookId: string,
  { staticPage = false }: { staticPage?: boolean } = {},
): Promise<BookWithNotes | null> {
  const book = await findBookById(bookId);

  if (!book) {
    return null;
  }

  // Unwritten skeleton sections (Todo, empty bullets) never reach the page.
  const notes = withoutPlaceholders(book.notes ?? "");
  // Never rejects (it degrades to the notes as written), so it can run
  // alongside the reads query.
  const linking = linkNotesToLibrary(notes);
  // Never rejects either, and waits a bounded time for previews it has not
  // seen. Loaded here so the book's OG image routes, which share this
  // module, never load sharp and the Markdown parser for it.
  const previewing = import("./linkPreview.server")
    .then(({ linkPreviewsFor, BOOK_PAGE_PREVIEW_WAIT_MS }) =>
      linkPreviewsFor(
        notes,
        staticPage ? BOOK_PAGE_PREVIEW_WAIT_MS : undefined,
      ),
    )
    .catch((): LinkPreviews => ({}));
  const otherReads = await db.query.books.findMany({
    where: and(
      sql`LOWER(${books.title}) = LOWER(${book.title})`,
      sql`LOWER(${books.author}) = LOWER(${book.author})`,
    ),
    columns: {
      id: true,
      started: true,
      finished: true,
      abandoned: true,
      abandonedAtMin: true,
      rating: true,
    },
    orderBy: [
      asc(
        sql`COALESCE(${books.finished}, ${books.abandoned}, 'infinity'::timestamp)`,
      ),
      asc(books.started),
      asc(books.id),
    ],
  });
  const otherReadings: BookReading[] = otherReads.map((reading) => ({
    id: reading.id,
    started: reading.started?.toISOString() ?? null,
    finished: reading.finished?.toISOString() ?? null,
    abandoned: reading.abandoned?.toISOString() ?? null,
    abandonedAtMin: reading.abandonedAtMin ?? null,
    rating: reading.rating ?? null,
  }));
  const completedReadings = otherReadings.filter(
    (reading) => !reading.abandoned,
  );

  // Transform database result to BookWithNotes type
  return {
    id: book.id,
    notionId: book.notionId,
    title: book.title,
    author: book.author,
    publicationYear: book.publicationYear,
    started: book.started?.toISOString() ?? null,
    finished: book.finished?.toISOString() ?? null,
    abandoned: book.abandoned?.toISOString() ?? null,
    abandonedAtMin: book.abandonedAtMin,
    rating: book.rating,
    audioLengthMin: book.audioLengthMin,
    pageCount: book.pageCount,
    tags: book.tags.map((t) => t.tagName),
    hasNotes: book.hasNotes,
    hasSummary: book.hasSummary,
    isAutomated: book.isAutomated,
    isFeatured: book.isFeatured,
    coverUrl: book.coverUrl,
    audibleUrl: book.audibleUrl,
    notionUrl: book.notionUrl,
    ...(await linking),
    linkPreviews: await previewing,
    coverColor: book.coverColor ?? null,
    readNumber: book.abandoned
      ? 0
      : completedReadings.findIndex((reading) => reading.id === book.id) + 1 ||
        1,
    totalReads: completedReadings.length,
    otherReadings,
  };
}

/**
 * Return the number of books represented on the main bookshelf.
 * This mirrors the books page's default view: finished or in-progress
 * books, with abandoned ones hidden.
 */
export async function getBookshelfBookCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(books)
    .where(
      and(
        isNull(books.abandoned),
        or(
          isNotNull(books.finished),
          and(isNotNull(books.started), isNull(books.finished)),
        ),
      ),
    );

  return Number(result?.count ?? 0);
}

/**
 * Get book slug by Notion ID (for redirect support from old URLs)
 * @param notionId - The original Notion page ID
 * @returns The slug (id) if found, null otherwise
 */
export async function getSlugByNotionId(
  notionId: string,
): Promise<string | null> {
  const book = await db.query.books.findFirst({
    where: eq(books.notionId, notionId),
    columns: { id: true },
  });

  return book?.id ?? null;
}

/** One shelf book as the /books OG card needs it: a cover to draw, the
 * sampled jacket color to order it by (and to stand in for a cover the host
 * will not serve), and the dates and runtime behind the card's numbers. */
export type BookshelfOGBook = {
  id: string;
  title: string;
  coverUrl: string | null;
  coverColor: string | null;
  started: string | null;
  finished: string | null;
  /** Always null here (the query hides abandoned books); present so the row
   * satisfies the homepage stats helper's input shape. */
  abandoned: null;
  pageCount: number | null;
  audioLengthMin: number | null;
};

/**
 * The default shelf for the /books OG card: finished or in-progress books,
 * abandoned ones hidden, mirroring the page's own default view.
 */
export async function getBookshelfForOG(): Promise<BookshelfOGBook[]> {
  const rows = await db.query.books.findMany({
    columns: {
      id: true,
      title: true,
      coverUrl: true,
      coverColor: true,
      started: true,
      finished: true,
      pageCount: true,
      audioLengthMin: true,
    },
    where: and(
      isNull(books.abandoned),
      or(
        isNotNull(books.finished),
        and(isNotNull(books.started), isNull(books.finished)),
      ),
    ),
    orderBy: (books, { desc }) => [desc(books.finished)],
  });
  return rows.map((book) => ({
    id: book.id,
    title: book.title,
    coverUrl: book.coverUrl,
    coverColor: book.coverColor ?? null,
    started: book.started?.toISOString() ?? null,
    finished: book.finished?.toISOString() ?? null,
    abandoned: null,
    pageCount: book.pageCount ?? null,
    audioLengthMin: book.audioLengthMin ?? null,
  }));
}
