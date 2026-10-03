"use client";

import { useBookPath } from "../hooks/useBookPath";
import { formatReadDates, formatSingleReadDate } from "../lib/format";
import { StarIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";

import type { RelatedBook } from "~/server/queries/relatedBooks";
import { api } from "~/trpc/react";

import { useOpenBookLink } from "~/components/books/useOpenBookLink";

import { BookRowTiltCover, BookRowTitle } from "./BookRow";

/**
 * The end of a book's notes: the books whose notes are closest to this
 * one's in meaning (src/server/queries/relatedBooks.ts). Nothing renders
 * until the list arrives, or when it is empty or failed: it is the last
 * thing on the page and the notes stand without it.
 *
 * A row opens its book the way a book linked from the notes does
 * (useOpenBookLink): over this page, in place of this modal, or as its own
 * page on a small screen. Over the page it flies out of the row's cover and
 * back into it. Like a shelf card, a row fetches its book while the pointer
 * rests on it, so the book view opens on its notes rather than a skeleton.
 */
export function RelatedBooks({
  bookId,
  booksHref,
}: {
  bookId: string;
  /** The Books site's origin when this book is open off that site. */
  booksHref?: string;
}) {
  const headingId = useId();
  const bookPath = useBookPath();
  const openBookLink = useOpenBookLink();
  const utils = api.useUtils();
  const { data: books } = api.books.getRelated.useQuery({ bookId });

  if (!books?.length) return null;
  return (
    <section aria-labelledby={headingId} data-related-books className="mt-20">
      {/* A break, so the list reads as after the notes, not part of them:
          five 12x3 pills, three over two, the lower pair centred under the
          gaps above like courses of brick. */}
      <div
        aria-hidden
        data-related-books-break
        className="flex flex-col items-center gap-1.5 text-muted-foreground/[0.175]"
      >
        {[3, 2].map((count) => (
          <div key={count} className="flex gap-1.5">
            {Array.from({ length: count }, (_, pill) => (
              <span
                key={pill}
                className="h-[3px] w-3 rounded-full bg-current"
              />
            ))}
          </div>
        ))}
      </div>
      <h2
        id={headingId}
        className="mt-16 text-2xl font-semibold text-foreground"
      >
        Related Books
      </h2>
      <ul className="-mx-2 mt-2 flex flex-col">
        {books.map((book) => {
          const href = booksHref
            ? `${booksHref}/${encodeURIComponent(book.id)}`
            : bookPath(book.id);
          const prefetch = () =>
            void utils.books.getById.prefetch({ bookId: book.id });
          return (
            <li key={book.id}>
              <Link
                href={href}
                data-route-transition="preserve"
                onClick={(event) =>
                  openBookLink(
                    event,
                    href,
                    book.id,
                    event.currentTarget.querySelector("[data-book-row-cover]"),
                  )
                }
                onMouseEnter={prefetch}
                onFocus={prefetch}
                onPointerDown={prefetch}
                className="flex w-full items-start gap-4 rounded-md p-2 text-left outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60"
              >
                <BookRowTiltCover book={book} />
                <div className="min-w-0 flex-1">
                  <BookRowTitle book={book} />
                  <RelatedBookFacts book={book} />
                </div>
              </Link>
            </li>
          );
        })}
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
