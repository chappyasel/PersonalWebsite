"use client";

import { BookCard } from "../../books/components/BookCard";

import type { Book } from "~/lib/books/types";

import { useRouteTransitionPrototype } from "./store";

// Give the physical shelf's covers honest, visible destinations during this
// comparison. Normal library sorting and filters remain in the grid below.
export default function BooksShelfLibraryPreview({ books }: { books: Book[] }) {
  const enabled = useRouteTransitionPrototype(
    (state) => state.enabled && state.variant === "bookshelf",
  );
  if (process.env.NODE_ENV === "production" || !enabled) return null;
  const featured = books
    .filter((book) => book.isFeatured && book.coverUrl && !book.abandoned)
    .slice(0, 8);
  if (!featured.length) return null;
  return (
    <section
      aria-label="Books from the 3D shelf"
      data-books-shelf-preview=""
      className="border-b border-border pb-6"
    >
      <p className="mb-4 text-sm text-muted-foreground">On the bookshelf</p>
      <div className="grid max-w-4xl grid-cols-4 gap-4 md:grid-cols-8">
        {featured.map((book) => (
          <BookCard key={book.id} book={book} size="S" />
        ))}
      </div>
    </section>
  );
}
