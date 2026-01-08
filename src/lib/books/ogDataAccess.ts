/**
 * Edge-compatible database access for OG image generation
 * Cannot use tRPC in edge runtime, so we use direct database queries
 */

import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";
import type { Book, BookWithNotes } from "./types";

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
    notionId: book.notionId,
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

/**
 * Fetch a book by ID with full notes for server-side rendering
 * This is used by the book detail page to pre-fetch data
 *
 * @param bookId - The book's slug ID
 * @returns The book with tags and notes, or null if not found
 */
export async function getBookWithNotes(
  bookId: string,
): Promise<BookWithNotes | null> {
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    with: {
      tags: true,
    },
  });

  if (!book) {
    return null;
  }

  // Transform database result to BookWithNotes type
  return {
    id: book.id,
    notionId: book.notionId,
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
    notes: book.notes ?? "",
  };
}

/**
 * Get book slug by Notion ID (for redirect support from old URLs)
 * @param notionId - The original Notion page ID
 * @returns The slug (id) if found, null otherwise
 */
export async function getSlugByNotionId(
  notionId: string,
): Promise<string | null> {
  const book = await db.query.books.findFirst({
    where: eq(books.notionId, notionId),
    columns: { id: true },
  });

  return book?.id ?? null;
}

/**
 * Fetch all books for main page OG image generation
 * Returns top books by rating and recency, prioritizing those with covers
 *
 * @returns Array of books with id, title, and coverUrl
 */
export async function getAllBooksForOG(): Promise<
  Array<{
    id: string;
    title: string;
    coverUrl: string | null;
  }>
> {
  const allBooks = await db.query.books.findMany({
    columns: {
      id: true,
      title: true,
      coverUrl: true,
      rating: true,
      finished: true,
    },
    orderBy: (books, { desc }) => [desc(books.rating), desc(books.finished)],
    limit: 50,
  });

  // Prioritize books with covers by moving them to the front
  const withCovers = allBooks.filter((book) => book.coverUrl !== null);
  const withoutCovers = allBooks.filter((book) => book.coverUrl === null);

  return [...withCovers, ...withoutCovers].map((book) => ({
    id: book.id,
    title: book.title,
    coverUrl: book.coverUrl,
  }));
}
