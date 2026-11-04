"use client";

import { useBookPath } from "../hooks/useBookPath";
import { type BookArrival, withBookArrival } from "../lib/noteMatchLink";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

import { useOpenBookLink } from "~/components/books/useOpenBookLink";

import { BookRowTiltCover, BookRowTitle } from "./BookRow";

/**
 * A row under a book's notes that opens another book: its folded cover,
 * title and author, then `children`. It opens the book the way a book
 * linked from the notes does (useOpenBookLink): over this page, in place of
 * this modal, or as its own page on a small screen. Over the page it flies
 * out of the row's cover and back into it. Like a shelf card, a row fetches
 * its book while the pointer rests on it, so the book view opens on its
 * notes rather than a skeleton. With an `arrival` it lands on that passage.
 */
export function BookRowLink({
  book,
  booksHref,
  arrival,
  children,
}: {
  book: Pick<
    Book,
    "id" | "title" | "author" | "publicationYear" | "coverUrl" | "coverColor"
  >;
  /** The Books site's origin when this book is open off that site. */
  booksHref?: string;
  arrival?: BookArrival;
  children: ReactNode;
}) {
  const bookPath = useBookPath();
  const openBookLink = useOpenBookLink();
  const utils = api.useUtils();
  const href = withBookArrival(
    booksHref
      ? `${booksHref}/${encodeURIComponent(book.id)}`
      : bookPath(book.id),
    arrival,
  );
  const prefetch = () => void utils.books.getById.prefetch({ bookId: book.id });
  return (
    <Link
      href={href}
      data-route-transition="preserve"
      onClick={(event) =>
        openBookLink(
          event,
          href,
          book.id,
          event.currentTarget.querySelector("[data-book-row-cover]"),
          arrival,
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
        {children}
      </div>
    </Link>
  );
}
