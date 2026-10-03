import { TRPCError } from "@trpc/server";
import { desc, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  computeDailyReading,
  computeReadingAnalytics,
} from "~/lib/books/analytics";
import { refreshBookCachesAfterSync } from "~/lib/books/cacheInvalidation";
import {
  NOTE_SEARCH_MAX_QUERY_LENGTH,
  noteSearchQuery,
} from "~/lib/books/notesSearch";
import { getBookWithNotes } from "~/lib/books/ogDataAccess";
import { syncBooksFromNotion } from "~/lib/books/sync";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { books, syncMetadata } from "~/server/db/schema";
import { searchBookNotes } from "~/server/queries/bookNotesSearch";
import {
  bookCollectionInputSchema,
  getBookStats,
  getBookTags,
  getBooks,
} from "~/server/queries/books";
import { orEmpty } from "~/server/queries/degrade";
import { getRelatedBooks } from "~/server/queries/relatedBooks";

export const booksRouter = createTRPCRouter({
  /**
   * Get all books with filters and sorting
   */
  getAll: publicProcedure
    .input(bookCollectionInputSchema)
    .query(({ input }) => getBooks(input)),

  /**
   * Books whose notes mention the query, with the matching passage. The
   * shelf lists these under its title and author matches.
   */
  searchNotes: publicProcedure
    .input(z.object({ query: z.string().max(NOTE_SEARCH_MAX_QUERY_LENGTH) }))
    .query(({ input }) => {
      const query = noteSearchQuery(input.query);
      return query ? searchBookNotes(query) : [];
    }),

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
   * The books whose notes are closest to this one's in meaning, for the end
   * of its page. Empty for a book without written notes, and when the
   * database is away: the page stands without them.
   */
  getRelated: publicProcedure
    .input(z.object({ bookId: z.string().min(1) }))
    .query(({ input }) =>
      orEmpty("related-books", () => getRelatedBooks(input.bookId), []),
    ),

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
