import { Client } from "@notionhq/client";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { bookTags, books, syncMetadata } from "~/server/db/schema";

import { fetchBookCover } from "./coverFetcher";
import {
  audibleUrlFromAsin,
  estimatePagesFromAudio,
  fetchAudibleLength,
  fetchPageCount,
  minutesToHourDotMinutes,
} from "./lengthFetcher";
import { generateAllBookIds } from "./slugify";
import {
  fetchBookDetails,
  fetchBooksFromNotion,
} from "./notion";
import { fetchWithBackoff } from "./rateLimiter";
import type { BaseBook } from "./types";

export type SyncResult = {
  totalBooksInNotion: number;
  booksAdded: number;
  booksUpdated: number;
  booksUnchanged: number;
  booksDeleted: number;
  fullContentFetched: number;
  fullContentSkipped: number;
  errors: SyncError[];
};

/**
 * Max books to delete in a single sync. If more than this are missing from
 * Notion, assume something is wrong (e.g. truncated API response) and skip
 * deletion entirely rather than wiping the table.
 */
const DELETION_GUARD_LIMIT = 3;

export type SyncError = {
  bookId: string;
  bookTitle: string;
  error: string;
  timestamp: Date;
};

type BookContentResult =
  | {
      success: true;
      book: BaseBook & { notes: string } & { lastEditedTime: string };
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
        finished: b.finished,
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

    // STEP 3.5: Delete books that no longer exist in Notion
    const notionIdSet = new Set(notionBooks.map((b) => b.notionId));
    const { deleted: booksDeleted, guardError } =
      await deleteBooksRemovedFromNotion(notionIdSet, dbBooks);

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

    if (guardError) {
      errors.push(guardError);
    }

    const result: SyncResult = {
      totalBooksInNotion: notionBooks.length,
      booksAdded: newBooks.length,
      booksUpdated: updatedBooks.length,
      booksUnchanged: unchangedBooks.length,
      booksDeleted,
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
 * Delete books from the database that no longer exist in Notion (deleted or
 * no longer matching the sync filter). Tags are removed via cascade.
 *
 * Bails out without deleting anything if more than DELETION_GUARD_LIMIT books
 * would be removed — a large gap almost certainly means a bad Notion response
 * rather than a real mass-deletion.
 */
async function deleteBooksRemovedFromNotion(
  notionIds: Set<string>,
  dbBooks: Array<{ id: string; notionId: string }>,
): Promise<{ deleted: number; guardError: SyncError | null }> {
  const staleBooks = dbBooks.filter((b) => !notionIds.has(b.notionId));

  if (staleBooks.length === 0) {
    return { deleted: 0, guardError: null };
  }

  if (staleBooks.length > DELETION_GUARD_LIMIT) {
    const slugs = staleBooks.map((b) => b.id).join(", ");
    const message = `Deletion guard tripped: ${staleBooks.length} books missing from Notion (limit ${DELETION_GUARD_LIMIT}). Skipping deletion of: ${slugs}`;
    console.warn(message);

    return {
      deleted: 0,
      guardError: {
        bookId: "deletion-guard",
        bookTitle: `${staleBooks.length} books missing from Notion`,
        error: message,
        timestamp: new Date(),
      },
    };
  }

  for (const book of staleBooks) {
    console.log(`Deleting book removed from Notion: ${book.id}`);
    await db.delete(books).where(eq(books.notionId, book.notionId));
  }

  return { deleted: staleBooks.length, guardError: null };
}

/**
 * Categorize books into new, updated, and unchanged.
 * Uses notionId for lookup since that's the stable identifier from Notion.
 */
function categorizeBooks(
  notionBooks: Array<BaseBook & { lastEditedTime?: string }>,
  dbBooksMap: Map<string, Date>, // Map<notionId, lastEditedTime>
): {
  newBooks: Array<BaseBook & { lastEditedTime: string }>;
  updatedBooks: Array<BaseBook & { lastEditedTime: string }>;
  unchangedBooks: Array<BaseBook & { lastEditedTime: string }>;
} {
  const newBooks: Array<BaseBook & { lastEditedTime: string }> = [];
  const updatedBooks: Array<BaseBook & { lastEditedTime: string }> = [];
  const unchangedBooks: Array<BaseBook & { lastEditedTime: string }> = [];

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
  booksToFetch: Array<BaseBook & { lastEditedTime: string }>,
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
 *
 * IMPORTANT: Slug assignments can shuffle when a book's finished date changes
 * (the most recent read claims the clean slug). We must migrate ALL changed
 * slugs before upserting content to prevent one book's new slug from
 * overwriting another book that currently holds that slug.
 */
async function upsertBooksToDatabase(
  contentResults: BookContentResult[],
  unchangedBooks: Array<BaseBook & { lastEditedTime: string }>,
): Promise<void> {
  // PRE-STEP: Migrate all changed slugs before any content upserts.
  // This prevents the case where an updated book's new slug collides with
  // an unchanged book's current slug, silently overwriting it.
  await migrateChangedSlugs(contentResults, unchangedBooks);

  // Process successful content fetches
  for (const result of contentResults) {
    if (!result.success) continue;

    const book = result.book;

    // Check if this is a truly new book (not previously in DB)
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

    // Enrich length data for ANY book passing through (new or updated) whose
    // Notion values are blank — this is what makes "clear the cell in Notion
    // to re-fetch" work. Manual Notion edits always win; a miss stays blank.
    const fetchedLengths: {
      audioLengthMin?: number;
      pageCount?: number;
      audibleUrl?: string;
    } = {};

    if (book.audioLengthMin == null) {
      try {
        const audible = await fetchAudibleLength(book.title, book.author);
        if (audible) {
          console.log(
            `  🎧 Audible match for "${book.title}": ${audible.matchedTitle} (${audible.runtimeMin} min)`,
          );
          book.audioLengthMin = audible.runtimeMin;
          book.audibleUrl = audibleUrlFromAsin(audible.asin);
          fetchedLengths.audioLengthMin = audible.runtimeMin;
          fetchedLengths.audibleUrl = book.audibleUrl;
        }
      } catch (error) {
        console.error(
          `  ✗ Failed to fetch audio length for ${book.title}:`,
          error,
        );
      }
    }

    if (book.pageCount == null) {
      try {
        const pages = await fetchPageCount(book.title, book.author);
        if (pages) {
          console.log(
            `  📖 Page count for "${book.title}": ${pages.pageCount} (${pages.matchedTitle})`,
          );
          book.pageCount = pages.pageCount;
          fetchedLengths.pageCount = pages.pageCount;
        } else if (book.audioLengthMin != null) {
          // No source has pages but runtime is known — estimate from the
          // catalog's empirical narration pace
          const estimated = estimatePagesFromAudio(book.audioLengthMin);
          console.log(
            `  📖 Estimated page count for "${book.title}": ${estimated} (from ${book.audioLengthMin} min audio)`,
          );
          book.pageCount = estimated;
          fetchedLengths.pageCount = estimated;
        }
      } catch (error) {
        console.error(
          `  ✗ Failed to fetch page count for ${book.title}:`,
          error,
        );
      }
    }

    if (Object.keys(fetchedLengths).length > 0) {
      await updateNotionLengths(book.notionId, fetchedLengths);
    }

    // Upsert book (use id as conflict target since it's the PK)
    // After migrateChangedSlugs, any slug conflicts have been resolved
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
        audioLengthMin: book.audioLengthMin,
        pageCount: book.pageCount,
        hasNotes: book.hasNotes,
        hasSummary: book.hasSummary,
        coverUrl: book.coverUrl,
        audibleUrl: book.audibleUrl,
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
          audioLengthMin: book.audioLengthMin,
          pageCount: book.pageCount,
          hasNotes: book.hasNotes,
          hasSummary: book.hasSummary,
          coverUrl: book.coverUrl,
          audibleUrl: book.audibleUrl,
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
  // Slug migration for these books was already handled by migrateChangedSlugs
  for (const book of unchangedBooks) {
    await db
      .update(books)
      .set({ lastSyncedAt: new Date() })
      .where(eq(books.notionId, book.notionId));
  }
}

/**
 * Migrate slugs that have changed for ALL books (including unchanged ones)
 * before any content upserts.
 *
 * When a re-read's finished date changes, generateAllBookIds may reassign
 * which book gets the "clean" slug. Without this step, an updated book's
 * new slug can collide with an unchanged book's current slug, causing the
 * unchanged book to be silently overwritten via onConflictDoUpdate.
 *
 * Strategy: delete all records with stale slugs first (to free the slug
 * namespace and handle swaps), then re-insert unchanged books with their
 * new slugs. Updated/new books will be re-inserted by the normal upsert.
 */
async function migrateChangedSlugs(
  contentResults: BookContentResult[],
  unchangedBooks: Array<BaseBook & { lastEditedTime: string }>,
): Promise<void> {
  // Build map of notionId → newSlug for ALL books in this sync
  const newSlugMap = new Map<string, string>();
  for (const result of contentResults) {
    if (result.success) {
      newSlugMap.set(result.book.notionId, result.book.id);
    }
  }
  for (const book of unchangedBooks) {
    newSlugMap.set(book.notionId, book.id);
  }

  // Fetch current slugs from DB
  const existingBooks = await db.query.books.findMany({
    columns: { id: true, notionId: true },
  });

  // Find books whose slugs need to change
  const slugChanges: { notionId: string; oldSlug: string; newSlug: string }[] =
    [];
  for (const existing of existingBooks) {
    const newSlug = newSlugMap.get(existing.notionId);
    if (newSlug && newSlug !== existing.id) {
      slugChanges.push({
        notionId: existing.notionId,
        oldSlug: existing.id,
        newSlug,
      });
    }
  }

  if (slugChanges.length === 0) return;

  console.log(`Migrating ${slugChanges.length} changed slug(s)...`);

  // Identify which changed-slug books are "unchanged" (need content preserved)
  const unchangedNotionIds = new Set(unchangedBooks.map((b) => b.notionId));
  const preservedData = new Map<
    string,
    {
      id: string;
      notionId: string;
      title: string;
      author: string;
      publicationYear: number | null;
      started: Date | null;
      finished: Date | null;
      rating: number | null;
      audioLengthMin: number | null;
      pageCount: number | null;
      hasNotes: boolean;
      hasSummary: boolean;
      coverUrl: string | null;
      audibleUrl: string | null;
      notionUrl: string;
      notes: string | null;
      lastEditedTime: Date;
      lastSyncedAt: Date;
      createdAt: Date;
      updatedAt: Date | null;
      tags: { id: number; bookId: string; tagName: string }[];
    }
  >();

  // Fetch full data for unchanged books before deleting
  for (const change of slugChanges) {
    if (unchangedNotionIds.has(change.notionId)) {
      const fullBook = await db.query.books.findFirst({
        where: eq(books.notionId, change.notionId),
        with: { tags: true },
      });
      if (fullBook) {
        preservedData.set(change.notionId, fullBook);
      }
    }
  }

  // Phase 1: Delete ALL records with changed slugs (frees slug namespace,
  // handles swaps where A→B and B→A). Cascade deletes tags.
  for (const change of slugChanges) {
    console.log(`  Slug migration: ${change.oldSlug} → ${change.newSlug}`);
    await db.delete(books).where(eq(books.notionId, change.notionId));
  }

  // Phase 2: Re-insert unchanged books with their new slugs (preserving content).
  // Updated/new books will be re-inserted by the normal upsert loop.
  for (const [notionId, fullBook] of preservedData) {
    const newSlug = slugChanges.find((c) => c.notionId === notionId)!.newSlug;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tags: tagsData, id: _oldId, ...bookData } = fullBook;

    await db.insert(books).values({
      ...bookData,
      id: newSlug,
      lastSyncedAt: new Date(),
    });

    if (tagsData.length > 0) {
      await db.insert(bookTags).values(
        tagsData.map((tag) => ({
          bookId: newSlug,
          tagName: tag.tagName,
        })),
      );
    }
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
        booksDeleted: data.booksDeleted,
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
 * Update book length properties in Notion. Writes only the properties that
 * were actually fetched so manual values are never touched.
 */
async function updateNotionLengths(
  pageId: string,
  values: {
    audioLengthMin?: number;
    pageCount?: number;
    audibleUrl?: string;
  },
): Promise<void> {
  const notion = new Client({ auth: env.NOTION_API_KEY });

  const properties: Record<
    string,
    { type: "number"; number: number } | { type: "url"; url: string }
  > = {};
  if (values.audioLengthMin !== undefined) {
    properties["Audio Length"] = {
      type: "number",
      number: minutesToHourDotMinutes(values.audioLengthMin),
    };
  }
  if (values.pageCount !== undefined) {
    properties.Pages = { type: "number", number: values.pageCount };
  }
  if (values.audibleUrl !== undefined) {
    properties.Audible = { type: "url", url: values.audibleUrl };
  }

  try {
    await notion.pages.update({
      page_id: pageId,
      properties,
    });
    console.log(
      `  ✓ Updated Notion lengths for page ${pageId.slice(0, 8)}...`,
    );
  } catch (error) {
    console.error(`  ✗ Failed to update Notion lengths for ${pageId}:`, error);
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
