/**
 * Script to fetch and add book covers for books that don't have them
 * Uses Google Books API and Open Library API as fallback
 */

// Load environment variables first
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
config({ path: join(__dirname, "../.env") });

import { Client } from "@notionhq/client";
import { eq, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fetchBookCover } from "../src/lib/books/coverFetcher";
import * as schema from "../src/server/db/schema";

const { books } = schema;

// Check required environment variables
if (!process.env.NOTION_API_KEY) {
  throw new Error("NOTION_API_KEY environment variable is required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create database connection (bypassing env validation)
const conn = postgres(process.env.DATABASE_URL);
const db = drizzle(conn, { schema });

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

type BookWithoutCover = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
};

/**
 * Fetch all books without cover URLs from database
 */
async function fetchBooksWithoutCovers(): Promise<BookWithoutCover[]> {
  const result = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
    })
    .from(books)
    .where(or(isNull(books.coverUrl), eq(books.coverUrl, "")));

  return result;
}

/**
 * Update book cover in database
 */
async function updateCoverInDatabase(
  bookId: string,
  coverUrl: string,
): Promise<void> {
  await db.update(books).set({ coverUrl }).where(eq(books.id, bookId));
}

/**
 * Update book cover in Notion
 */
async function updateCoverInNotion(
  bookId: string,
  coverUrl: string,
): Promise<void> {
  try {
    await notion.pages.update({
      page_id: bookId,
      properties: {
        Cover: {
          type: "url",
          url: coverUrl,
        },
      },
    });
  } catch (error) {
    console.error(`Failed to update Notion page ${bookId}:`, error);
    throw error;
  }
}

/**
 * Process a single book to add cover
 */
async function processBook(
  book: BookWithoutCover,
  dryRun: boolean,
): Promise<{ success: boolean; coverUrl: string | null }> {
  console.log(`\n[${book.title}] by ${book.author}`);

  const coverUrl = await fetchBookCover(book.title, book.author);

  if (!coverUrl) {
    console.log(`  ✗ No cover found`);
    return { success: false, coverUrl: null };
  }

  if (dryRun) {
    console.log(`  ✓ Would add cover: ${coverUrl}`);
    console.log(`  (DRY RUN - not updating)`);
    return { success: true, coverUrl };
  }

  try {
    // Update database first
    await updateCoverInDatabase(book.id, coverUrl);
    console.log(`  ✓ Updated database`);

    // Then update Notion
    await updateCoverInNotion(book.id, coverUrl);
    console.log(`  ✓ Updated Notion`);

    return { success: true, coverUrl };
  } catch (error) {
    console.error(`  ✗ Error updating:`, error);
    return { success: false, coverUrl: null };
  }
}

/**
 * Main function
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("BOOK COVER FETCHER");
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  // Fetch books without covers
  console.log("Fetching books without covers from database...\n");
  const booksWithoutCovers = await fetchBooksWithoutCovers();

  if (booksWithoutCovers.length === 0) {
    console.log("✓ All books have covers! Nothing to do.");
    return;
  }

  console.log(`Found ${booksWithoutCovers.length} books without covers\n`);

  // Process each book
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < booksWithoutCovers.length; i++) {
    const book = booksWithoutCovers[i]!;
    console.log(`\n[${"=".repeat(Math.floor((i / booksWithoutCovers.length) * 50))}${" ".repeat(50 - Math.floor((i / booksWithoutCovers.length) * 50))}] ${i + 1}/${booksWithoutCovers.length}`);

    const result = await processBook(book, dryRun);

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total books processed: ${booksWithoutCovers.length}`);
  console.log(`✓ Covers added: ${successCount}`);
  console.log(`✗ Not found: ${failureCount}`);

  if (dryRun) {
    console.log("\n⚠️  This was a DRY RUN - no changes were made");
    console.log("Run without --dry-run to actually update the books");
  }
}

// Run the script
main()
  .then(() => {
    console.log("\n✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Script failed:", error);
    process.exit(1);
  });
