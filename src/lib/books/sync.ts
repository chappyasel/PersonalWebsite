import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { bookTags, books, syncMetadata } from "~/server/db/schema";

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

    // STEP 2: Fetch existing books from database
    const dbBooks = await db.query.books.findMany({
      columns: { id: true, lastEditedTime: true },
    });
    const dbBooksMap = new Map(
      dbBooks.map((b) => [b.id, new Date(b.lastEditedTime)]),
    );
    console.log(`Found ${dbBooks.length} books in database`);

    // STEP 3: Categorize books (new, updated, unchanged)
    const { newBooks, updatedBooks, unchangedBooks } = categorizeBooks(
      notionBooks,
      dbBooksMap,
    );

    console.log(
      `Categorized: ${newBooks.length} new, ${updatedBooks.length} updated, ${unchangedBooks.length} unchanged`,
    );

    // STEP 4: Rate-limited full content fetch for new + updated books
    const booksNeedingContent = [...newBooks, ...updatedBooks];
    const contentFetchResults =
      await fetchBooksContentWithRateLimit(booksNeedingContent);

    // STEP 5: Upsert books to database
    console.log("Upserting books to database...");
    await upsertBooksToDatabase(contentFetchResults, unchangedBooks);

    // STEP 6: Calculate results
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
 * Categorize books into new, updated, and unchanged
 */
function categorizeBooks(
  notionBooks: Array<Book & { lastEditedTime?: string }>,
  dbBooksMap: Map<string, Date>,
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

    const dbLastEdited = dbBooksMap.get(book.id);

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
 * Fetch full content for books with rate limiting (parallel processing)
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
    const displayTitle = book.title || `[ID: ${book.id.slice(0, 8)}]`;

    try {
      const bookWithNotes = await fetchWithBackoff(() =>
        fetchBookDetails(book.id),
      );

      completed++;
      console.log(`✓ [${completed}/${total}] Fetched: ${displayTitle}`);

      return {
        success: true,
        book: { ...bookWithNotes, lastEditedTime: book.lastEditedTime },
      } as BookContentResult;
    } catch (error) {
      completed++;
      console.error(
        `✗ [${completed}/${total}] Failed: ${displayTitle}:`,
        error,
      );

      return {
        success: false,
        bookId: book.id,
        bookTitle: book.title,
        error: error instanceof Error ? error.message : "Unknown error",
      } as BookContentResult;
    }
  });

  const results = await Promise.all(promises);
  return results;
}

/**
 * Upsert books to database
 */
async function upsertBooksToDatabase(
  contentResults: BookContentResult[],
  unchangedBooks: Array<Book & { lastEditedTime: string }>,
): Promise<void> {
  // Process successful content fetches
  for (const result of contentResults) {
    if (!result.success) continue;

    const book = result.book;

    // Upsert book
    await db
      .insert(books)
      .values({
        id: book.id,
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

  // Update lastSyncedAt for unchanged books
  for (const book of unchangedBooks) {
    await db
      .update(books)
      .set({ lastSyncedAt: new Date() })
      .where(eq(books.id, book.id));
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
