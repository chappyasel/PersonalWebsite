"use client";

import { formatReadDates, formatSingleReadDate } from "../lib/format";
import { StarIcon } from "@phosphor-icons/react";
import { useId } from "react";

import type { RelatedBook } from "~/server/queries/relatedBooks";
import { api } from "~/trpc/react";

import { BookRowLink } from "./BookRowLink";

/**
 * The books whose notes are closest to this one's in meaning
 * (src/server/queries/relatedBooks.ts), last at the end of a book's notes
 * (BookNotesEnd). Nothing renders until the list arrives, or when it is
 * empty or failed, or when every book in it is already listed above it
 * (`exclude`, the books that cite this one).
 */
export function RelatedBooks({
  bookId,
  booksHref,
  exclude,
}: {
  bookId: string;
  /** The Books site's origin when this book is open off that site. */
  booksHref?: string;
  /** Books the page already lists under its notes. */
  exclude?: ReadonlySet<string>;
}) {
  const headingId = useId();
  const { data } = api.books.getRelated.useQuery({ bookId });
  const books = data?.filter((book) => !exclude?.has(book.id));

  if (!books?.length) return null;
  return (
    <section aria-labelledby={headingId} data-related-books>
      <h2 id={headingId} className="text-2xl font-semibold text-foreground">
        Related Books
      </h2>
      <ul className="-mx-2 mt-2 flex flex-col">
        {books.map((book) => (
          <li key={book.id}>
            <BookRowLink book={book} booksHref={booksHref}>
              <RelatedBookFacts book={book} />
            </BookRowLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Rating, then when it was read, the two facts the homepage's book cards
 * carry under a title (BookPreviewRow).
 */
function RelatedBookFacts({ book }: { book: RelatedBook }) {
  const dates = book.finished
    ? (formatReadDates(book.started, book.finished) ??
      formatSingleReadDate(book.finished))
    : book.started
      ? `Started ${formatSingleReadDate(book.started)}`
      : null;
  return (
    <>
      {book.rating && (
        <span
          role="img"
          aria-label={`${book.rating} out of 5 stars`}
          className="mt-1.5 flex gap-px"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon
              key={i}
              size={13}
              weight={i < book.rating! ? "fill" : "duotone"}
              className={
                i < book.rating!
                  ? "text-yellow-400"
                  : "text-muted-foreground/25"
              }
            />
          ))}
        </span>
      )}
      {dates && (
        <p className="mt-1 truncate text-sm text-muted-foreground">{dates}</p>
      )}
    </>
  );
}
