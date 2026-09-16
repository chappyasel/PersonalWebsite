import { TRPCError } from "@trpc/server";
import { desc, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  computeDailyReading,
  computeReadingAnalytics,
} from "~/lib/books/analytics";
import { refreshBookCachesAfterSync } from "~/lib/books/cacheInvalidation";
import { getBookWithNotes } from "~/lib/books/ogDataAccess";
import { syncBooksFromNotion } from "~/lib/books/sync";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { books, syncMetadata } from "~/server/db/schema";
import {
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
      const book = await getBookWithNotes(input.bookId);
      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }
      return book;
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
      where: or(isNotNull(books.finished), isNotNull(books.abandoned)),
      columns: {
        started: true,
        finished: true,
        abandoned: true,
        abandonedAtMin: true,
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
        where: or(isNotNull(books.finished), isNotNull(books.abandoned)),
        columns: {
          started: true,
          finished: true,
          abandoned: true,
          abandonedAtMin: true,
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
    const result = await syncBooksFromNotion("manual", async (bookIds) => {
      await refreshBookCachesAfterSync(
        {
          bookIdsToInvalidate: bookIds,
          bookIdsToWarm: [],
        },
        "manual",
      );
    });
    const cacheRefresh = await refreshBookCachesAfterSync(result, "manual");
    return { ...result, cacheRefresh };
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
