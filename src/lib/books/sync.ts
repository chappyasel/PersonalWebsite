import { eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { bookTags, books, syncMetadata } from "~/server/db/schema";

import { resolveCoverColor } from "./coverColor.server";
import { stripCoverCurl } from "./coverUtils";
import { needsMetadata, selectMetadataBatch } from "./metadata";
import { enrichNotionBook } from "./metadataEnrichment";
import {
  type NotionBook,
  WEBSITE_PROPERTY,
  ensureWebsiteProperty,
  fetchBookDetails,
  fetchBooksFromNotion,
} from "./notion";
import { createBookNotionClient } from "./notionClient";
import { generateAllBookIds } from "./slugify";
import { shouldFetchBookContent, websiteUrlToWrite } from "./syncPlanning";

export type SyncResult = {
  totalBooksInNotion: number;
  booksAdded: number;
  booksUpdated: number;
  booksUnchanged: number;
  booksDeleted: number;
  bookIdsToInvalidate: string[];
  bookIdsToWarm: string[];
  fullContentFetched: number;
  fullContentSkipped: number;
  /** Notion pages whose `Website` link was written this run. */
  websiteUrlsWritten: number;
  /** Pages still holding a missing or stale link; the next sync retries them. */
  websiteUrlsPending: number;
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
      book: NotionBook & { notes: string };
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
  onPropertiesChanged?: (bookIds: string[]) => Promise<void>,
  options: { onlyNotionIds?: string[] } = {},
): Promise<SyncResult> {
  const onlyIds =
    options.onlyNotionIds === undefined
      ? undefined
      : new Set(options.onlyNotionIds);
  if (onlyIds && (onlyIds.size === 0 || onlyIds.size > 20)) {
    throw new Error(
      "onlyNotionIds must select between 1 and 20 mirrored Notion pages",
    );
  }
  // A scoped run still needs the whole catalog to assign reread slugs safely.
  const notionBooks = await fetchBooksFromNotion();
  if (
    onlyIds &&
    [...onlyIds].some((id) => !notionBooks.some((book) => book.notionId === id))
  ) {
    throw new Error(
      "Requested Notion ID is absent from the Started/Finished catalog; no books were written",
    );
  }
  const dbBooks = await db.query.books.findMany({
    columns: {
      id: true,
      notionId: true,
      lastEditedTime: true,
      isFeatured: true,
      author: true,
      coverUrl: true,
      coverColor: true,
      publicationYear: true,
      pageCount: true,
      audioLengthMin: true,
      audibleUrl: true,
    },
  });
  const storedByNotionId = new Map(
    dbBooks.map((book) => [book.notionId, book]),
  );
  const withSlugs = (catalog: NotionBook[]) => {
    const slugMap = generateAllBookIds(catalog);
    return catalog.map((book) => ({
      ...book,
      id: slugMap.get(book.notionId) ?? book.notionId,
    }));
  };
  const checkScope = (catalog: NotionBook[]) => {
    if (!onlyIds) return;
    for (const book of catalog.filter((book) => onlyIds.has(book.notionId))) {
      const owner = dbBooks.find(
        (row) =>
          row.id === book.id &&
          row.notionId !== book.notionId &&
          !onlyIds.has(row.notionId),
      );
      if (owner)
        throw new Error(
          `Target slug collision: ${book.id} belongs to unrelated Notion page ${owner.notionId}; refresh both readings explicitly`,
        );
    }
  };
  checkScope(withSlugs(notionBooks));
  const syncId = await createSyncRecord(
    onlyIds ? `${triggeredBy}:scoped` : triggeredBy,
  );
  try {
    // New books get immediate lookup capacity; retries have their own reserved
    // budget. Overflow new pages join normal retries once mirrored. Rotation
    // includes complete rows, so successful repairs never reset the cursor.
    // Scoped maintenance must not advance the global retry rotation.
    const retryRun = onlyIds
      ? 0
      : (
          await db
            .select({ count: sql<number>`count(*)::int` })
            .from(syncMetadata)
            .where(inArray(syncMetadata.triggeredBy, ["cron", "manual"]))
        )[0]!.count;
    const selected = notionBooks.filter(
      (book) => !onlyIds || onlyIds.has(book.notionId),
    );
    const newPages = selected.filter(
      (book) => !storedByNotionId.has(book.notionId),
    );
    const existingPages = selected.filter((book) =>
      storedByNotionId.has(book.notionId),
    );
    const batch = onlyIds
      ? selected.filter(needsMetadata)
      : [
          ...selectMetadataBatch(newPages.filter(needsMetadata), retryRun, 10),
          ...selectMetadataBatch(existingPages, retryRun, 20),
        ];
    // Four workers bound outbound catalog concurrency. Each failure is isolated.
    const recovered = new Map<string, NotionBook>();
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, batch.length) }, async () => {
        while (next < batch.length) {
          const book = batch[next++]!;
          recovered.set(book.notionId, await enrichNotionBook(book));
        }
      }),
    );
    const catalogWithSlugs = withSlugs(
      notionBooks.map((book) => recovered.get(book.notionId) ?? book),
    );
    checkScope(catalogWithSlugs);
    const syncBooks = catalogWithSlugs.filter(
      (book) => !onlyIds || onlyIds.has(book.notionId),
    );
    const dbBooksMap = new Map(
      dbBooks.map((book) => [book.notionId, new Date(book.lastEditedTime)]),
    );

    const {
      deleted: booksDeleted,
      deletedBookIds,
      guardError,
    } = onlyIds
      ? { deleted: 0, deletedBookIds: [], guardError: null }
      : await deleteBooksRemovedFromNotion(
          new Set(notionBooks.map((book) => book.notionId)),
          dbBooks,
        );

    // Preserve existing notes and tags through ALL slug migrations, even if
    // their upcoming note fetch fails. No note watermark advances here.
    await migrateChangedSlugs(syncBooks);
    const propertiesChangedIds = new Set<string>();
    const propertiesWarmIds = new Set<string>();
    for (const book of syncBooks) {
      const stored = storedByNotionId.get(book.notionId);
      if (!stored) continue;
      const changes: Partial<typeof books.$inferInsert> = {};
      for (const field of [
        "author",
        "publicationYear",
        "pageCount",
        "audioLengthMin",
        "audibleUrl",
        "isFeatured",
      ] as const) {
        if (stored[field] !== book[field])
          Object.assign(changes, { [field]: book[field] });
      }
      const coverUrl = stripCoverCurl(book.coverUrl);
      if (stored.coverUrl !== coverUrl) {
        changes.coverUrl = coverUrl;
        changes.coverColor = coverUrl
          ? await resolveCoverColor(coverUrl)
          : null;
      }
      if (Object.keys(changes).length)
        await db
          .update(books)
          .set(changes)
          .where(eq(books.notionId, book.notionId));
      if (Object.keys(changes).length || stored.id !== book.id) {
        propertiesChangedIds.add(stored.id);
        propertiesChangedIds.add(book.id);
        propertiesWarmIds.add(book.id);
      }
    }
    if (propertiesChangedIds.size)
      await onPropertiesChanged?.([...propertiesChangedIds]);
    const { newBooks, updatedBooks, unchangedBooks } = categorizeBooks(
      syncBooks,
      dbBooksMap,
    );
    const contentFetchResults = await fetchBooksContentWithRateLimit([
      ...newBooks,
      ...updatedBooks,
    ]);
    await upsertBooksToDatabase(contentFetchResults, unchangedBooks);
    const successfulChangedBooks = contentFetchResults
      .filter((result) => result.success)
      .map((result) => result.book);
    const mirroredBooks = syncBooks.filter(
      (book) =>
        storedByNotionId.has(book.notionId) ||
        successfulChangedBooks.some(
          (changed) => changed.notionId === book.notionId,
        ),
    );
    const bookIdsToWarm = new Set([
      ...propertiesWarmIds,
      ...successfulChangedBooks.map((book) => book.id),
    ]);
    const bookIdsToInvalidate = new Set([
      ...deletedBookIds,
      ...propertiesChangedIds,
      ...bookIdsToWarm,
    ]);
    const { websiteUrlsWritten, websiteUrlsPending } =
      await syncWebsiteUrlsToNotion(mirroredBooks);
    const errors: SyncError[] = contentFetchResults
      .filter((result) => !result.success)
      .map((result) => ({
        bookId: result.bookId,
        bookTitle: result.bookTitle,
        error: result.error,
        timestamp: new Date(),
      }));
    if (guardError) errors.push(guardError);
    const result: SyncResult = {
      totalBooksInNotion: notionBooks.length,
      booksAdded: newBooks.length,
      booksUpdated: updatedBooks.length,
      booksUnchanged: unchangedBooks.length,
      booksDeleted,
      bookIdsToInvalidate: [...bookIdsToInvalidate].sort(),
      bookIdsToWarm: [...bookIdsToWarm].sort(),
      fullContentFetched: successfulChangedBooks.length,
      fullContentSkipped: unchangedBooks.length,
      websiteUrlsWritten,
      websiteUrlsPending,
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
): Promise<{
  deleted: number;
  deletedBookIds: string[];
  guardError: SyncError | null;
}> {
  const staleBooks = dbBooks.filter((b) => !notionIds.has(b.notionId));

  if (staleBooks.length === 0) {
    return { deleted: 0, deletedBookIds: [], guardError: null };
  }

  if (staleBooks.length > DELETION_GUARD_LIMIT) {
    const slugs = staleBooks.map((b) => b.id).join(", ");
    const message = `Deletion guard tripped: ${staleBooks.length} books missing from Notion (limit ${DELETION_GUARD_LIMIT}). Skipping deletion of: ${slugs}`;
    console.warn(message);

    return {
      deleted: 0,
      deletedBookIds: [],
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
    // The page may still exist (dates cleared) with a link that now 404s.
    // A trashed page rejects the update, which is logged and harmless.
    await updateNotionWebsiteUrl(book.notionId, book.id, null);
  }

  return {
    deleted: staleBooks.length,
    deletedBookIds: staleBooks.map((book) => book.id),
    guardError: null,
  };
}

/**
 * Categorize books into new, updated, and unchanged.
 * Uses notionId for lookup since that's the stable identifier from Notion.
 */
function categorizeBooks(
  notionBooks: NotionBook[],
  dbBooksMap: Map<string, Date>, // Map<notionId, lastEditedTime>
): {
  newBooks: NotionBook[];
  updatedBooks: NotionBook[];
  unchangedBooks: NotionBook[];
} {
  const newBooks: NotionBook[] = [];
  const updatedBooks: NotionBook[] = [];
  const unchangedBooks: NotionBook[] = [];

  for (const book of notionBooks) {
    // Use notionId for lookup (stable identifier from Notion)
    const dbLastEdited = dbBooksMap.get(book.notionId);

    if (!dbLastEdited) {
      // Book doesn't exist in database - it's new
      newBooks.push(book);
    } else {
      const notionEditedTime = new Date(book.lastEditedTime);
      if (shouldFetchBookContent(notionEditedTime, dbLastEdited)) {
        // Book was edited or has incomplete metadata that needs repair.
        updatedBooks.push(book);
      } else {
        // Book is unchanged
        unchangedBooks.push(book);
      }
    }
  }

  return { newBooks, updatedBooks, unchangedBooks };
}

/**
 * Fetch book content concurrently, with individual Notion requests sharing
 * the rate-limited client queue.
 * Uses notionId to fetch from Notion API, preserves slug ID for database.
 */
async function fetchBooksContentWithRateLimit(
  booksToFetch: NotionBook[],
): Promise<BookContentResult[]> {
  console.log(
    `Fetching full content for ${booksToFetch.length} books (Notion requests spaced 350 ms apart)...`,
  );

  // Track completed count for progress logging
  let completed = 0;
  const total = booksToFetch.length;

  // Interleave books while the shared client queue limits API requests.
  const promises = booksToFetch.map(async (book) => {
    const displayTitle = book.title || `[ID: ${book.notionId.slice(0, 8)}]`;

    try {
      // Use notionId to fetch from Notion API
      const bookWithNotes = await fetchBookDetails(book.notionId);

      completed++;
      console.log(`✓ [${completed}/${total}] Fetched: ${displayTitle}`);

      // Preserve the slug ID we generated, but use the notes from Notion
      return {
        success: true,
        book: {
          ...book,
          notes: bookWithNotes.notes,
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
  unchangedBooks: NotionBook[],
): Promise<void> {
  // Sampling a cover color downloads the jacket, which is slow next to the
  // rest of the upsert. Keep the stored color while the cover URL is unchanged
  // and sample only when a cover is new, repaired, or was never sampled.
  const storedCovers = new Map(
    (
      await db.query.books.findMany({
        columns: { notionId: true, coverUrl: true, coverColor: true },
      })
    ).map((row) => [row.notionId, row]),
  );

  // Process successful content fetches
  for (const result of contentResults) {
    if (!result.success) continue;

    const book = result.book;

    if (book.finished && book.abandoned) {
      console.warn(
        `"${book.title}" has both Finished and Abandoned dates set in Notion — finished wins; clear one of them.`,
      );
    }

    // Notion's Cover property holds Google Books URLs as pasted, page curl
    // and all. Store the flat art so every consumer starts clean and the
    // one-off cleanup of the column survives the next sync.
    book.coverUrl = stripCoverCurl(book.coverUrl);

    const storedCover = storedCovers.get(book.notionId);
    let coverColor =
      storedCover?.coverUrl === book.coverUrl ? storedCover.coverColor : null;
    if (coverColor === null && book.coverUrl) {
      coverColor = await resolveCoverColor(book.coverUrl);
      console.log(
        coverColor
          ? `  🎨 Cover color for "${book.title}": ${coverColor}`
          : `  ✗ Could not sample a cover color for ${book.title}`,
      );
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
        abandoned: book.abandoned ? new Date(book.abandoned) : null,
        abandonedAtMin: book.abandonedAtMin,
        rating: book.rating,
        audioLengthMin: book.audioLengthMin,
        pageCount: book.pageCount,
        hasNotes: book.hasNotes,
        hasSummary: book.hasSummary,
        isAutomated: book.isAutomated,
        isFeatured: book.isFeatured,
        coverUrl: book.coverUrl,
        coverColor,
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
          abandoned: book.abandoned ? new Date(book.abandoned) : null,
          abandonedAtMin: book.abandonedAtMin,
          rating: book.rating,
          audioLengthMin: book.audioLengthMin,
          pageCount: book.pageCount,
          hasNotes: book.hasNotes,
          hasSummary: book.hasSummary,
          isAutomated: book.isAutomated,
          isFeatured: book.isFeatured,
          coverUrl: book.coverUrl,
          coverColor,
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

/** Move selected slugs atomically, preserving notes, watermarks and tags. */
async function migrateChangedSlugs(syncBooks: NotionBook[]): Promise<void> {
  const newSlugMap = new Map(syncBooks.map((book) => [book.notionId, book.id]));
  await db.transaction(async (tx) => {
    const existingBooks = await tx.query.books.findMany({
      columns: { id: true, notionId: true },
    });
    const changes = existingBooks.filter(
      (book) =>
        newSlugMap.has(book.notionId) &&
        newSlugMap.get(book.notionId) !== book.id,
    );
    // Preserve every row before deleting any, including reads whose notes may fail.
    const preserved = await Promise.all(
      changes.map(async (change) => {
        const fullBook = await tx.query.books.findFirst({
          where: eq(books.notionId, change.notionId),
          with: { tags: true },
        });
        if (!fullBook)
          throw new Error(
            `Book disappeared during slug migration: ${change.notionId}`,
          );
        return fullBook;
      }),
    );
    for (const book of preserved)
      await tx.delete(books).where(eq(books.notionId, book.notionId));
    for (const book of preserved) {
      const { tags, ...data } = book;
      const id = newSlugMap.get(book.notionId)!;
      await tx.insert(books).values({ ...data, id });
      if (tags.length)
        await tx
          .insert(bookTags)
          .values(tags.map((tag) => ({ bookId: id, tagName: tag.tagName })));
    }
  });
}

/**
 * Create a new sync record
 */
async function createSyncRecord(
  triggeredBy: "cron" | "manual" | "cron:scoped" | "manual:scoped",
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
 * Most `Website` links written in one sync. A slug change touches one or two
 * pages, so this only bites on a mass rewrite (a new host, a fresh column),
 * where it reserves time for content and cache refreshes. Requests share the
 * same paced queue as reads. The remainder goes out on following syncs.
 */
const MAX_WEBSITE_WRITES_PER_SYNC = 150;

/**
 * Write each book's site page into Notion's `Website` property when the
 * property is empty or names a stale slug. Nothing here throws past this
 * function; a failed write is logged,
 * counted as pending, and retried by the next sync, which sees the same gap.
 */
async function syncWebsiteUrlsToNotion(
  syncedBooks: Array<
    Pick<NotionBook, "notionId" | "id" | "title" | "websiteUrl">
  >,
): Promise<{ websiteUrlsWritten: number; websiteUrlsPending: number }> {
  const writes = syncedBooks.flatMap((book) => {
    const url = websiteUrlToWrite(book);
    return url ? [{ book, url }] : [];
  });
  let written = 0;
  const outcome = () => ({
    websiteUrlsWritten: written,
    websiteUrlsPending: writes.length - written,
  });
  if (writes.length === 0) return outcome();

  const batch = writes.slice(0, MAX_WEBSITE_WRITES_PER_SYNC);
  console.log(
    `Writing ${batch.length} of ${writes.length} pending site link(s) into Notion...`,
  );
  // Only when there is something to write, so a steady-state sync costs no
  // extra Notion calls. A failure here (a 429 past its retries, a revoked
  // integration) postpones the links; it must not fail the book sync.
  try {
    await ensureWebsiteProperty();
  } catch (error) {
    console.error(
      `  ✗ Could not confirm the "${WEBSITE_PROPERTY}" property; leaving ${writes.length} site link(s) for the next sync:`,
      error,
    );
    return outcome();
  }

  for (const { book, url } of batch) {
    const ok = await updateNotionWebsiteUrl(
      book.notionId,
      book.title || book.id,
      url,
    );
    if (ok) written++;
  }
  return outcome();
}

/**
 * Set (or clear, with null) the `Website` link on one Notion page.
 * Resolves false instead of throwing so one bad page never fails the sync.
 */
async function updateNotionWebsiteUrl(
  pageId: string,
  label: string,
  websiteUrl: string | null,
): Promise<boolean> {
  const notion = createBookNotionClient();
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        [WEBSITE_PROPERTY]: { type: "url", url: websiteUrl },
      },
    });
    console.log(
      `  🔗 ${websiteUrl ? `Linked "${label}" to ${websiteUrl}` : `Cleared the site link on "${label}"`}`,
    );
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to write the site link for "${label}":`, error);
    return false;
  }
}
