/**
 * Migration script: Convert book IDs from Notion UUIDs to human-readable slugs
 *
 * This script:
 * 1. Reads all books from the database
 * 2. Generates deterministic slugs for each book
 * 3. Updates the database:
 *    - Copies current `id` to `notion_id`
 *    - Updates `id` to the new slug
 *    - Updates `book_tags.book_id` references
 *
 * Run with: npx tsx scripts/migrate-book-ids.ts
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import { books, bookTags } from "../src/server/db/schema";
import { generateAllBookIds } from "../src/lib/books/slugify";

async function migrateBookIds() {
  console.log("Starting book ID migration...\n");

  // Step 1: Fetch all books from database
  console.log("Step 1: Fetching all books from database...");
  const allBooks = await db.query.books.findMany({
    columns: {
      id: true,
      title: true,
      author: true,
      publicationYear: true,
      finished: true,
    },
  });
  console.log(`Found ${allBooks.length} books\n`);

  // Step 2: Check if notionId column exists and is populated
  // If a book has notionId different from id, migration has already run
  const sampleBook = await db.query.books.findFirst({
    columns: { id: true, notionId: true },
  });

  if (sampleBook && sampleBook.notionId && sampleBook.notionId !== sampleBook.id) {
    console.log("Migration appears to have already run (notionId differs from id).");
    console.log("To regenerate slugs, you'll need to run a sync instead.\n");
    process.exit(0);
  }

  // Step 3: Generate slugs for all books
  console.log("Step 2: Generating slugs for all books...");
  const slugMap = generateAllBookIds(
    allBooks.map((b) => ({
      notionId: b.id, // Current id is the Notion ID
      title: b.title,
      author: b.author || null,
      publicationYear: b.publicationYear,
      finished: b.finished?.toISOString() ?? null,
    })),
  );

  // Show slug mappings
  console.log("\nSlug mappings:");
  for (const book of allBooks.slice(0, 10)) {
    const slug = slugMap.get(book.id);
    console.log(`  ${book.title.substring(0, 40).padEnd(40)} -> ${slug}`);
  }
  if (allBooks.length > 10) {
    console.log(`  ... and ${allBooks.length - 10} more\n`);
  }

  // Step 4: Update database in a transaction
  console.log("\nStep 3: Updating database...");

  await db.transaction(async (tx) => {
    for (const book of allBooks) {
      const notionId = book.id; // Current id is the Notion UUID
      const newSlug = slugMap.get(notionId);

      if (!newSlug) {
        console.error(`  ERROR: No slug generated for book "${book.title}"`);
        continue;
      }

      // Skip if already migrated and slug hasn't changed
      if (newSlug === book.id) {
        console.log(`  SKIP: "${book.title}" (already migrated)`);
        continue;
      }

      // Step 4a: Get existing tags for this book
      const existingTags = await tx
        .select({ tagName: bookTags.tagName })
        .from(bookTags)
        .where(eq(bookTags.bookId, notionId));

      // Step 4b: Delete the old book_tags
      await tx.delete(bookTags).where(eq(bookTags.bookId, notionId));

      // Step 4c: Get full book record
      const [oldBook] = await tx
        .select()
        .from(books)
        .where(eq(books.id, notionId));

      if (!oldBook) {
        console.error(`  ERROR: Book not found: ${notionId}`);
        continue;
      }

      // Step 4d: Delete old book record
      await tx.delete(books).where(eq(books.id, notionId));

      // Step 4e: Insert with new slug as ID
      await tx.insert(books).values({
        id: newSlug,
        notionId: notionId,
        title: oldBook.title,
        author: oldBook.author,
        publicationYear: oldBook.publicationYear,
        started: oldBook.started,
        finished: oldBook.finished,
        rating: oldBook.rating,
        hasNotes: oldBook.hasNotes,
        hasSummary: oldBook.hasSummary,
        isAutomated: oldBook.isAutomated,
        coverUrl: oldBook.coverUrl,
        notionUrl: oldBook.notionUrl,
        notes: oldBook.notes,
        lastEditedTime: oldBook.lastEditedTime,
        lastSyncedAt: oldBook.lastSyncedAt,
        createdAt: oldBook.createdAt,
        updatedAt: oldBook.updatedAt,
      });

      // Step 4f: Re-insert tags with new book ID
      if (existingTags.length > 0) {
        await tx.insert(bookTags).values(
          existingTags.map((tag) => ({
            bookId: newSlug,
            tagName: tag.tagName,
          })),
        );
      }

      console.log(`  OK: "${book.title}" -> ${newSlug} (${existingTags.length} tags)`);
    }
  });

  console.log("\nMigration complete!");
}

// Run migration
migrateBookIds()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
