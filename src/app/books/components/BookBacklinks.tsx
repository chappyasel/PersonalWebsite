"use client";

import { useId } from "react";

import type { BookBacklink } from "~/server/queries/bookBacklinks";

import { BookRowLink } from "./BookRowLink";

/**
 * The books whose notes link to this one (src/server/queries/bookBacklinks.ts),
 * each with the line that links it, the link's words in the text colour.
 * A row opens its book at that line's chapter or takeaway and marks the
 * link's words there for a few seconds, as a notes search match does.
 */
export function BookBacklinks({
  books,
  booksHref,
}: {
  books: BookBacklink[];
  /** The Books site's origin when this book is open off that site. */
  booksHref?: string;
}) {
  const headingId = useId();
  if (!books.length) return null;
  return (
    <section aria-labelledby={headingId} data-book-backlinks>
      <h2 id={headingId} className="text-2xl font-semibold text-foreground">
        Referenced In
      </h2>
      <ul className="-mx-2 mt-2 flex flex-col">
        {books.map((book) => (
          <li key={book.id}>
            <BookRowLink
              book={book}
              booksHref={booksHref}
              arrival={{ highlight: book.linkText, anchor: book.anchor }}
            >
              <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
                {book.excerpt.map((segment, index) =>
                  segment.match ? (
                    <span key={index} className="text-foreground">
                      {segment.text}
                    </span>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </p>
            </BookRowLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
