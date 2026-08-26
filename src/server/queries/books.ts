import "server-only";

import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import type {
  Book,
  BookReading,
  BookStats,
} from "~/lib/books/types";
import { db } from "~/server/db";
import { bookTags, books } from "~/server/db/schema";

import { getBookOrderBy } from "./bookOrder";

export const BOOKS_DATA_TAG = "books-data";
export const BOOKS_REVALIDATE_SECONDS = 60 * 60 * 24;

export const bookCollectionInputSchema = z.object({
  tags: z.array(z.string()).optional(),
  minRating: z.number().min(1).max(5).optional(),
  hasNotes: z.boolean().optional(),
  searchQuery: z.string().optional(),
  sortField: z
    .enum([
      "finished",
      "title",
      "rating",
      "publicationYear",
      "runtime",
      "pageCount",
    ])
    .default("finished"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().min(1).max(500).default(500),
  offset: z.number().min(0).default(0),
});

export type BookCollectionInput = z.infer<typeof bookCollectionInputSchema>;

export async function getBooks(input: BookCollectionInput): Promise<Book[]> {
  const conditions = [
    sql`(${books.finished} IS NOT NULL OR (${books.started} IS NOT NULL AND ${books.finished} IS NULL))`,
  ];

  if (input.minRating) conditions.push(gte(books.rating, input.minRating));
  if (input.hasNotes !== undefined) {
    conditions.push(eq(books.hasNotes, input.hasNotes));
  }
  if (input.searchQuery) {
    const searchPattern = `%${input.searchQuery}%`;
    conditions.push(
      or(
        ilike(books.title, searchPattern),
        ilike(books.author, searchPattern),
      )!,
    );
  }

  const orderBy = getBookOrderBy(input.sortField, input.sortOrder);

  const results = await db.query.books.findMany({
    where: and(...conditions),
    with: { tags: true },
    orderBy,
    limit: input.limit,
    offset: input.offset,
  });

  const filteredResults =
    input.tags && input.tags.length > 0
      ? results.filter((book) =>
          input.tags!.some((tag) =>
            book.tags.some((item) => item.tagName === tag),
          ),
        )
      : results;

  const transformed = filteredResults.map(
    (book): Book => ({
      id: book.id,
      notionId: book.notionId,
      title: book.title,
      author: book.author,
      publicationYear: book.publicationYear ?? null,
      started: book.started?.toISOString() ?? null,
      finished: book.finished?.toISOString() ?? null,
      abandoned: book.abandoned?.toISOString() ?? null,
      abandonedAtMin: book.abandonedAtMin ?? null,
      rating: book.rating ?? null,
      audioLengthMin: book.audioLengthMin ?? null,
      pageCount: book.pageCount ?? null,
      tags: book.tags.map((item) => item.tagName),
      hasNotes: book.hasNotes,
      hasSummary: book.hasSummary,
      isAutomated: book.isAutomated,
      isFeatured: book.isFeatured,
      coverUrl: book.coverUrl,
      audibleUrl: book.audibleUrl,
      notionUrl: book.notionUrl,
      readNumber: 1,
      totalReads: 1,
      otherReadings: [],
    }),
  );

  const readGroups = new Map<string, Book[]>();
  for (const book of transformed) {
    const key = `${book.title.toLowerCase()}|||${book.author.toLowerCase()}`;
    const group = readGroups.get(key) ?? [];
    group.push(book);
    readGroups.set(key, group);
  }

  for (const group of readGroups.values()) {
    if (group.length <= 1) {
      // A lone abandoned attempt is not a first read
      if (group[0]?.abandoned) {
        group[0].readNumber = 0;
        group[0].totalReads = 0;
      }
      continue;
    }
    // Timeline position is when the attempt ended: finish date, or abandoned
    // date for drops. In-progress reads (neither) sort last.
    group.sort((a, b) =>
      (a.finished ?? a.abandoned ?? "9999").localeCompare(
        b.finished ?? b.abandoned ?? "9999",
      ),
    );
    const allReadings: BookReading[] = group.map((book) => ({
      started: book.started,
      finished: book.finished,
      abandoned: book.abandoned,
      abandonedAtMin: book.abandonedAtMin,
      rating: book.rating,
    }));
    // Abandoned attempts show in the reading history but never claim a read
    // number — "2nd Read" means the book was actually read twice.
    const completed = group.filter((book) => !book.abandoned);
    group.forEach((book) => {
      book.readNumber = book.abandoned ? 0 : completed.indexOf(book) + 1;
      book.totalReads = completed.length;
      book.otherReadings = allReadings;
    });
  }

  return transformed;
}

export async function getBookStats(): Promise<BookStats> {
  // Tag counts back the filter sidebar, which describes the default shelf —
  // abandoned books are hidden there, so their tags don't count either.
  const result = await db
    .select({
      tag: bookTags.tagName,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookTags)
    .innerJoin(books, eq(bookTags.bookId, books.id))
    .where(isNull(books.abandoned))
    .groupBy(bookTags.tagName)
    .orderBy(desc(sql`COUNT(*)`));

  return {
    categoryBreakdown: Object.fromEntries(
      result.map((row) => [row.tag, Number(row.count)]),
    ),
  };
}

export async function getBookTags(): Promise<string[]> {
  // Same exclusion as getBookStats: a tag carried only by abandoned books
  // would otherwise offer a filter with nothing behind it.
  const result = await db
    .select({
      tag: bookTags.tagName,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookTags)
    .innerJoin(books, eq(bookTags.bookId, books.id))
    .where(isNull(books.abandoned))
    .groupBy(bookTags.tagName)
    .orderBy(desc(sql`COUNT(*)`));

  return result.map((item) => item.tag);
}

export const getDefaultBooks = unstable_cache(
  () =>
    getBooks({
      sortField: "finished",
      sortOrder: "desc",
      limit: 500,
      offset: 0,
    }),
  ["default-book-collection"],
  {
    revalidate: BOOKS_REVALIDATE_SECONDS,
    tags: [BOOKS_DATA_TAG],
  },
);

export const getCachedBookTags = unstable_cache(
  getBookTags,
  ["book-tags"],
  {
    revalidate: BOOKS_REVALIDATE_SECONDS,
    tags: [BOOKS_DATA_TAG],
  },
);

export const getCachedBookStats = unstable_cache(
  getBookStats,
  ["book-stats"],
  {
    revalidate: BOOKS_REVALIDATE_SECONDS,
    tags: [BOOKS_DATA_TAG],
  },
);
