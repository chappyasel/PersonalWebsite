import { Client } from "@notionhq/client";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { bookTags, books, syncMetadata } from "~/server/db/schema";

import { fetchBookCover } from "./coverFetcher";
import { generateAllBookIds } from "./slugify";
import {
  fetchBookDetails,
  fetchBooksFromNotion,
} from "./notion";
import { fetchWithBackoff } from "./rateLimiter";
import type { Book, BookWithNotes } from "./types";

export type SyncResult = {
  totalBooksInNotion: number;
  booksAdded: number;
  booksUpdated: number;
  booksUnchanged: number;
  fullContentFetched: number;
  fullContentSkipped: number;
  errors: SyncError[];
};

export type SyncError = {
  bookId: string;
  bookTitle: string;
  error: string;
  timestamp: Date;
};

type BookContentResult =
  | {
      success: true;
      book: BookWithNotes & { lastEditedTime: string };
    }
  | {
      success: false;
      bookId: string;
      bookTitle: string;
      error: string;
    };

/**
 * Main sync orchestrator - syncs all books from Notion to database
 */
export async function syncBooksFromNotion(
  triggeredBy: "cron" | "manual" = "cron",
): Promise<SyncResult> {
  const syncId = await createSyncRecord(triggeredBy);

  try {
    console.log("Starting book sync...");

    // STEP 1: Fetch all book metadata from Notion
    console.log("Fetching all books from Notion...");
    const notionBooks = await fetchBooksFromNotion();
    console.log(`Found ${notionBooks.length} books in Notion`);

    // STEP 2: Generate human-readable slugs for all books
    console.log("Generating slugs for all books...");
    const slugMap = generateAllBookIds(
      notionBooks.map((b) => ({
        notionId: b.notionId,
        title: b.title,
        author: b.author || null,
        publicationYear: b.publicationYear,
      })),
    );

    // Apply slugs to books
    const notionBooksWithSlugs = notionBooks.map((book) => ({
      ...book,
      id: slugMap.get(book.notionId) ?? book.notionId, // Fallback shouldn't happen
    }));

    // STEP 3: Fetch existing books from database (indexed by notionId)
    const dbBooks = await db.query.books.findMany({
      columns: { id: true, notionId: true, lastEditedTime: true },
    });
    const dbBooksMap = new Map(
      dbBooks.map((b) => [b.notionId, new Date(b.lastEditedTime)]),
    );
    console.log(`Found ${dbBooks.length} books in database`);

    // STEP 4: Categorize books (new, updated, unchanged)
    const { newBooks, updatedBooks, unchangedBooks } = categorizeBooks(
      notionBooksWithSlugs,
      dbBooksMap,
    );

    console.log(
      `Categorized: ${newBooks.length} new, ${updatedBooks.length} updated, ${unchangedBooks.length} unchanged`,
    );

    // STEP 5: Rate-limited full content fetch for new + updated books
    const booksNeedingContent = [...newBooks, ...updatedBooks];
    const contentFetchResults =
      await fetchBooksContentWithRateLimit(booksNeedingContent);

    // STEP 6: Upsert books to database
    console.log("Upserting books to database...");
    await upsertBooksToDatabase(contentFetchResults, unchangedBooks);

    // STEP 7: Calculate results
    const errors = contentFetchResults
      .filter((r) => !r.success)
      .map((r) => ({
        bookId: r.bookId,
        bookTitle: r.bookTitle,
        error: r.error,
        timestamp: new Date(),
      }));

    const result: SyncResult = {
      totalBooksInNotion: notionBooks.length,
      booksAdded: newBooks.length,
      booksUpdated: updatedBooks.length,
      booksUnchanged: unchangedBooks.length,
      fullContentFetched: contentFetchResults.filter((r) => r.success).length,
      fullContentSkipped: unchangedBooks.length,
      errors,
    };

    console.log("Sync completed successfully:", result);
    await completeSyncRecord(syncId, "success", result);

    return result;
  } catch (error) {
    console.error("Sync failed:", error);
    await completeSyncRecord(syncId, "failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Categorize books into new, updated, and unchanged.
 * Uses notionId for lookup since that's the stable identifier from Notion.
 */
function categorizeBooks(
  notionBooks: Array<Book & { lastEditedTime?: string }>,
  dbBooksMap: Map<string, Date>, // Map<notionId, lastEditedTime>
): {
  newBooks: Array<Book & { lastEditedTime: string }>;
  updatedBooks: Array<Book & { lastEditedTime: string }>;
  unchangedBooks: Array<Book & { lastEditedTime: string }>;
} {
  const newBooks: Array<Book & { lastEditedTime: string }> = [];
  const updatedBooks: Array<Book & { lastEditedTime: string }> = [];
  const unchangedBooks: Array<Book & { lastEditedTime: string }> = [];

  for (const book of notionBooks) {
    const lastEditedTime = book.lastEditedTime ?? new Date().toISOString();
    const bookWithTime = { ...book, lastEditedTime };

    // Use notionId for lookup (stable identifier from Notion)
    const dbLastEdited = dbBooksMap.get(book.notionId);

    if (!dbLastEdited) {
      // Book doesn't exist in database - it's new
      newBooks.push(bookWithTime);
    } else {
      const notionEditedTime = new Date(lastEditedTime);
      if (notionEditedTime > dbLastEdited) {
        // Book has been edited since last sync
        updatedBooks.push(bookWithTime);
      } else {
        // Book is unchanged
        unchangedBooks.push(bookWithTime);
      }
    }
  }

  return { newBooks, updatedBooks, unchangedBooks };
}

/**
 * Fetch full content for books with rate limiting (parallel processing).
 * Uses notionId to fetch from Notion API, preserves slug ID for database.
 */
async function fetchBooksContentWithRateLimit(
  booksToFetch: Array<Book & { lastEditedTime: string }>,
): Promise<BookContentResult[]> {
  console.log(
    `Fetching full content for ${booksToFetch.length} books in parallel (concurrency: 20)...`,
  );

  // Track completed count for progress logging
  let completed = 0;
  const total = booksToFetch.length;

  // Process all books in parallel with p-queue managing concurrency
  const promises = booksToFetch.map(async (book) => {
    const displayTitle = book.title || `[ID: ${book.notionId.slice(0, 8)}]`;

    try {
      // Use notionId to fetch from Notion API
      const bookWithNotes = await fetchWithBackoff(() =>
        fetchBookDetails(book.notionId),
      );

      completed++;
      console.log(`✓ [${completed}/${total}] Fetched: ${displayTitle}`);

      // Preserve the slug ID we generated, but use the notes from Notion
      return {
        success: true,
        book: {
          ...bookWithNotes,
          id: book.id, // Use our generated slug
          lastEditedTime: book.lastEditedTime,
        },
      } as BookContentResult;
    } catch (error) {
      completed++;
      console.error(
        `✗ [${completed}/${total}] Failed: ${displayTitle}:`,
        error,
      );

      return {
        success: false,
        bookId: book.notionId,
        bookTitle: book.title,
        error: error instanceof Error ? error.message : "Unknown error",
      } as BookContentResult;
    }
  });

  const results = await Promise.all(promises);
  return results;
}

/**
 * Upsert books to database.
 * Uses notionId as the conflict key since slugs (id) may change.
 */
async function upsertBooksToDatabase(
  contentResults: BookContentResult[],
  unchangedBooks: Array<Book & { lastEditedTime: string }>,
): Promise<void> {
  // Process successful content fetches
  for (const result of contentResults) {
    if (!result.success) continue;

    const book = result.book;

    // First, check if this book exists with a different slug
    // If so, we need to delete the old record first (due to PK constraint)
    const existing = await db.query.books.findFirst({
      where: eq(books.notionId, book.notionId),
      columns: { id: true },
    });

    // For NEW books without covers, try to fetch one
    if (!existing && !book.coverUrl) {
      console.log(`  📚 Fetching cover for new book: ${book.title}`);
      try {
        const fetchedCover = await fetchBookCover(book.title, book.author);
        if (fetchedCover) {
          book.coverUrl = fetchedCover;
          // Update Notion with the cover
          await updateNotionCover(book.notionId, fetchedCover);
        }
      } catch (error) {
        console.error(`  ✗ Failed to fetch cover for ${book.title}:`, error);
      }
    }

    if (existing && existing.id !== book.id) {
      // Slug changed - delete old record (cascade will handle tags)
      await db.delete(books).where(eq(books.notionId, book.notionId));
    }

    // Upsert book (use id as conflict target since it's the PK)
    await db
      .insert(books)
      .values({
        id: book.id,
        notionId: book.notionId,
        title: book.title,
        author: book.author,
        publicationYear: book.publicationYear,
        started: book.started ? new Date(book.started) : null,
        finished: book.finished ? new Date(book.finished) : null,
        rating: book.rating,
        hasNotes: book.hasNotes,
        hasSummary: book.hasSummary,
        coverUrl: book.coverUrl,
        notionUrl: book.notionUrl,
        notes: book.notes ?? null,
        lastEditedTime: new Date(book.lastEditedTime),
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: books.id,
        set: {
          notionId: book.notionId,
          title: book.title,
          author: book.author,
          publicationYear: book.publicationYear,
          started: book.started ? new Date(book.started) : null,
          finished: book.finished ? new Date(book.finished) : null,
          rating: book.rating,
          hasNotes: book.hasNotes,
          hasSummary: book.hasSummary,
          coverUrl: book.coverUrl,
          notionUrl: book.notionUrl,
          notes: book.notes ?? null,
          lastEditedTime: new Date(book.lastEditedTime),
          lastSyncedAt: new Date(),
        },
      });

    // Delete existing tags and insert new ones
    await db.delete(bookTags).where(eq(bookTags.bookId, book.id));

    if (book.tags.length > 0) {
      await db.insert(bookTags).values(
        book.tags.map((tag) => ({
          bookId: book.id,
          tagName: tag,
        })),
      );
    }
  }

  // Update lastSyncedAt for unchanged books (use notionId for lookup)
  for (const book of unchangedBooks) {
    await db
      .update(books)
      .set({ lastSyncedAt: new Date() })
      .where(eq(books.notionId, book.notionId));
  }
}

/**
 * Create a new sync record
 */
async function createSyncRecord(
  triggeredBy: "cron" | "manual",
): Promise<number> {
  const result = await db
    .insert(syncMetadata)
    .values({
      status: "in_progress",
      triggeredBy,
    })
    .returning({ id: syncMetadata.id });

  return result[0]!.id;
}

/**
 * Complete a sync record
 */
async function completeSyncRecord(
  syncId: number,
  status: "success" | "failed",
  data: SyncResult | { error: string },
): Promise<void> {
  if (status === "success" && "totalBooksInNotion" in data) {
    await db
      .update(syncMetadata)
      .set({
        syncCompletedAt: new Date(),
        status,
        totalBooksInNotion: data.totalBooksInNotion,
        booksAdded: data.booksAdded,
        booksUpdated: data.booksUpdated,
        booksUnchanged: data.booksUnchanged,
        fullContentFetched: data.fullContentFetched,
        fullContentSkipped: data.fullContentSkipped,
        errors: JSON.stringify(data.errors),
        errorCount: data.errors.length,
      })
      .where(eq(syncMetadata.id, syncId));
  } else {
    await db
      .update(syncMetadata)
      .set({
        syncCompletedAt: new Date(),
        status,
        errors: JSON.stringify([data]),
        errorCount: 1,
      })
      .where(eq(syncMetadata.id, syncId));
  }
}

/**
 * Update book cover in Notion
 */
async function updateNotionCover(
  pageId: string,
  coverUrl: string,
): Promise<void> {
  const notion = new Client({ auth: env.NOTION_API_KEY });
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Cover: {
          type: "url",
          url: coverUrl,
        },
      },
    });
    console.log(`  ✓ Updated Notion cover for page ${pageId.slice(0, 8)}...`);
  } catch (error) {
    console.error(`  ✗ Failed to update Notion cover for ${pageId}:`, error);
  }
}
