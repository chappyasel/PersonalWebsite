import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { syncBooksFromNotion } from "~/lib/books/sync";
import type { Book, BookStats, BookWithNotes } from "~/lib/books/types";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { bookTags, books, syncMetadata } from "~/server/db/schema";

export const booksRouter = createTRPCRouter({
  /**
   * Get all books with filters and sorting
   */
  getAll: publicProcedure
    .input(
      z.object({
        // Filters
        tags: z.array(z.string()).optional(),
        minRating: z.number().min(1).max(5).optional(),
        hasNotes: z.boolean().optional(),
        searchQuery: z.string().optional(),

        // Sorting
        sortField: z.enum(["finished", "title", "rating"]).default("finished"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),

        // Pagination
        limit: z.number().min(1).max(500).default(500),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      // Build where conditions
      const conditions = [];

      // Include finished books OR currently reading books (started but not finished)
      conditions.push(
        sql`(${books.finished} IS NOT NULL OR (${books.started} IS NOT NULL AND ${books.finished} IS NULL))`,
      );

      if (input.minRating) {
        conditions.push(gte(books.rating, input.minRating));
      }

      if (input.hasNotes !== undefined) {
        conditions.push(eq(books.hasNotes, input.hasNotes));
      }

      if (input.searchQuery) {
        const searchPattern = `%${input.searchQuery}%`;
        conditions.push(
          or(
            ilike(books.title, searchPattern),
            ilike(books.author, searchPattern),
          ),
        );
      }

      // Build order by - for finished date sorting, treat NULL finished (currently reading) as today
      let orderBy;
      if (input.sortField === "finished") {
        // Currently reading books (NULL finished) are treated as "today" for sorting purposes
        orderBy =
          input.sortOrder === "desc"
            ? desc(sql`COALESCE(${books.finished}, NOW())`)
            : asc(sql`COALESCE(${books.finished}, NOW())`);
      } else {
        orderBy =
          input.sortOrder === "desc"
            ? desc(books[input.sortField])
            : asc(books[input.sortField]);
      }

      // Execute query with tags joined
      const results = await db.query.books.findMany({
        where: and(...conditions),
        with: {
          tags: true,
        },
        orderBy,
        limit: input.limit,
        offset: input.offset,
      });

      // Filter by tags if specified (post-query filter)
      let filteredResults = results;
      if (input.tags && input.tags.length > 0) {
        filteredResults = results.filter((book) =>
          input.tags!.some((tag) => book.tags.some((t) => t.tagName === tag)),
        );
      }

      // Transform to Book type
      return filteredResults.map(
        (book): Book => ({
          id: book.id,
          notionId: book.notionId,
          title: book.title,
          author: book.author,
          publicationYear: book.publicationYear ?? null,
          started: book.started?.toISOString() ?? null,
          finished: book.finished?.toISOString() ?? null,
          rating: book.rating ?? null,
          tags: book.tags.map((t) => t.tagName),
          hasNotes: book.hasNotes,
          hasSummary: book.hasSummary,
          coverUrl: book.coverUrl,
          notionUrl: book.notionUrl,
        }),
      );
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
      const book = await db.query.books.findFirst({
        where: eq(books.id, input.bookId),
        with: {
          tags: true,
        },
      });

      if (!book) {
        throw new Error("Book not found");
      }

      // simulate a delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result: BookWithNotes = {
        id: book.id,
        notionId: book.notionId,
        title: book.title,
        author: book.author,
        publicationYear: book.publicationYear ?? null,
        started: book.started?.toISOString() ?? null,
        finished: book.finished?.toISOString() ?? null,
        rating: book.rating ?? null,
        tags: book.tags.map((t) => t.tagName),
        hasNotes: book.hasNotes,
        hasSummary: book.hasSummary,
        coverUrl: book.coverUrl,
        notionUrl: book.notionUrl,
        notes: book.notes ?? "",
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
  getStats: publicProcedure.query(async () => {
    // Category breakdown
    const categoryBreakdownResult = await db
      .select({
        tag: bookTags.tagName,
        count: sql<number>`COUNT(*)`,
      })
      .from(bookTags)
      .groupBy(bookTags.tagName)
      .orderBy(desc(sql`COUNT(*)`));

    const categoryBreakdown: Record<string, number> = {};
    categoryBreakdownResult.forEach((row) => {
      categoryBreakdown[row.tag] = Number(row.count);
    });

    const stats: BookStats = {
      categoryBreakdown,
    };

    return stats;
  }),

  /**
   * Get all unique tags
   */
  getTags: publicProcedure.query(async () => {
    const tagsResult = await db
      .select({
        tag: bookTags.tagName,
        count: sql<number>`COUNT(*)`,
      })
      .from(bookTags)
      .groupBy(bookTags.tagName)
      .orderBy(desc(sql`COUNT(*)`));

    return tagsResult.map((t) => t.tag);
  }),

  /**
   * Manual sync trigger (protected - require authentication)
   */
  triggerSync: protectedProcedure.mutation(async () => {
    const result = await syncBooksFromNotion("manual");
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
