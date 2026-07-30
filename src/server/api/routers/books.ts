import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import {
  computeDailyReading,
  computeReadingAnalytics,
} from "~/lib/books/analytics";
import { syncBooksFromNotion } from "~/lib/books/sync";
import type {
  BookReading,
  BookWithNotes,
} from "~/lib/books/types";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { books, syncMetadata } from "~/server/db/schema";
import {
  BOOKS_DATA_TAG,
  bookCollectionInputSchema,
  getBookStats,
  getBookTags,
  getBooks,
} from "~/server/queries/books";

export const booksRouter = createTRPCRouter({
  /**
   * Get all books with filters and sorting
   */
  getAll: publicProcedure
    .input(bookCollectionInputSchema)
    .query(({ input }) => getBooks(input)),

  /**
   * Get book by ID with full notes
   */
  getById: publicProcedure
    .input(
      z.object({
        bookId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const book = await db.query.books.findFirst({
        where: eq(books.id, input.bookId),
        with: {
          tags: true,
        },
      });

      if (!book) {
        throw new Error("Book not found");
      }

      // Find other readings of the same book (case-insensitive title+author match,
      // consistent with the getAll grouping which uses toLowerCase())
      const otherReads = await db.query.books.findMany({
        where: and(
          sql`LOWER(${books.title}) = LOWER(${book.title})`,
          sql`LOWER(${books.author}) = LOWER(${book.author})`,
        ),
        columns: {
          started: true,
          finished: true,
          rating: true,
        },
        orderBy: asc(sql`COALESCE(${books.finished}, NOW())`),
      });

      const allReadings: BookReading[] = otherReads.map((r) => ({
        started: r.started?.toISOString() ?? null,
        finished: r.finished?.toISOString() ?? null,
        rating: r.rating ?? null,
      }));

      // Determine this book's read number
      const readNumber =
        allReadings.findIndex(
          (r) =>
            r.started === (book.started?.toISOString() ?? null) &&
            r.finished === (book.finished?.toISOString() ?? null),
        ) + 1 || 1;

      const result: BookWithNotes = {
        id: book.id,
        notionId: book.notionId,
        title: book.title,
        author: book.author,
        publicationYear: book.publicationYear ?? null,
        started: book.started?.toISOString() ?? null,
        finished: book.finished?.toISOString() ?? null,
        rating: book.rating ?? null,
        audioLengthMin: book.audioLengthMin ?? null,
        pageCount: book.pageCount ?? null,
        tags: book.tags.map((t) => t.tagName),
        hasNotes: book.hasNotes,
        hasSummary: book.hasSummary,
        coverUrl: book.coverUrl,
        audibleUrl: book.audibleUrl,
        notionUrl: book.notionUrl,
        notes: book.notes ?? "",
        readNumber,
        totalReads: allReadings.length,
        otherReadings: allReadings,
      };

      return result;
    }),

  /**
   * Get book by Notion ID (for redirect support from old URLs)
   * Returns just the slug if found, null if not
   */
  getSlugByNotionId: publicProcedure
    .input(
      z.object({
        notionId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const book = await db.query.books.findFirst({
        where: eq(books.notionId, input.notionId),
        columns: { id: true },
      });

      return book?.id ?? null;
    }),

  /**
   * Get book statistics
   */
  getStats: publicProcedure.query(getBookStats),

  /**
   * Get estimated reading-time analytics (weekly/monthly/yearly buckets)
   */
  getReadingAnalytics: publicProcedure.query(async () => {
    const rows = await db.query.books.findMany({
      where: isNotNull(books.finished),
      columns: {
        started: true,
        finished: true,
        audioLengthMin: true,
        pageCount: true,
      },
    });

    return computeReadingAnalytics(rows);
  }),

  /**
   * Per-day reading hours for one year (heatmap). Kept separate from
   * getReadingAnalytics to avoid shipping ~4k daily buckets in one payload.
   */
  getDailyReading: publicProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ input }) => {
      const rows = await db.query.books.findMany({
        where: isNotNull(books.finished),
        columns: {
          started: true,
          finished: true,
          audioLengthMin: true,
          pageCount: true,
        },
      });

      return computeDailyReading(rows, input.year);
    }),

  /**
   * Get all unique tags
   */
  getTags: publicProcedure.query(getBookTags),

  /**
   * Manual sync trigger (protected - require authentication)
   */
  triggerSync: protectedProcedure.mutation(async () => {
    const result = await syncBooksFromNotion("manual");
    revalidateTag(BOOKS_DATA_TAG, "max");
    revalidatePath("/books", "layout");
    revalidatePath("/");
    return result;
  }),

  /**
   * Get last sync status
   */
  getSyncStatus: publicProcedure.query(async () => {
    const lastSync = await db.query.syncMetadata.findFirst({
      orderBy: desc(syncMetadata.syncStartedAt),
    });

    return lastSync;
  }),
});
