"use client";

import { useBookPath } from "../hooks/useBookPath";
import Link from "next/link";
import { useId } from "react";

import { api } from "~/trpc/react";

import { useOpenBookLink } from "~/components/books/useOpenBookLink";

import { BookRowCover, BookRowTitle } from "./BookRow";

/**
 * The end of a book's notes: the books whose notes are closest to this
 * one's in meaning (src/server/queries/relatedBooks.ts). Nothing renders
 * until the list arrives, or when it is empty or failed: it is the last
 * thing on the page and the notes stand without it.
 *
 * A row opens its book the way a book linked from the notes does
 * (useOpenBookLink): over this page, in place of this modal, or as its own
 * page on a small screen.
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
  const { data: books } = api.books.getRelated.useQuery({ bookId });

  if (!books?.length) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-related-books
      className="mt-16 flex flex-col gap-2"
    >
      <h2 id={headingId} className="text-2xl font-semibold text-foreground">
        Related books
      </h2>
      <ul className="-mx-2 flex flex-col">
        {books.map((book) => {
          const href = booksHref
            ? `${booksHref}/${encodeURIComponent(book.id)}`
            : bookPath(book.id);
          return (
            <li key={book.id}>
              <Link
                href={href}
                data-route-transition="preserve"
                onClick={(event) => openBookLink(event, href, book.id)}
                className="flex w-full items-start gap-4 rounded-md p-2 text-left outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60"
              >
                <BookRowCover book={book} />
                <div className="min-w-0 flex-1">
                  <BookRowTitle book={book} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
