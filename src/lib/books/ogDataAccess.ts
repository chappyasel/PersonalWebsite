/**
 * Edge-compatible database access for OG image generation
 * Cannot use tRPC in edge runtime, so we use direct database queries
 */

import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";
import type { Book } from "./types";

/**
 * Fetch a book by ID for OG image generation
 * This is edge-runtime compatible (no tRPC)
 *
 * @param bookId - The book's Notion page ID
 * @returns The book with tags
 * @throws Error if book not found
 */
export async function getBookForOG(bookId: string): Promise<Book> {
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    with: {
      tags: true,
    },
  });

  if (!book) {
    throw new Error(`Book not found: ${bookId}`);
  }

  // Transform database result to Book type
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    publicationYear: book.publicationYear,
    started: book.started?.toISOString() ?? null,
    finished: book.finished?.toISOString() ?? null,
    rating: book.rating,
    tags: book.tags.map((t) => t.tagName),
    hasNotes: book.hasNotes,
    hasSummary: book.hasSummary,
    coverUrl: book.coverUrl,
    notionUrl: book.notionUrl,
  };
}
