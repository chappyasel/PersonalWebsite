"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";

import { BookBacklinks } from "./BookBacklinks";
import { RelatedBooks } from "./RelatedBooks";

/**
 * What follows a book's notes: the books whose notes link to it, then the
 * books closest to it in meaning, less any already listed as linking it.
 * Nothing renders until one list arrives with rows, and a failed list is
 * left out: this is the last thing on the page and the notes stand
 * without it.
 */
export function BookNotesEnd({
  bookId,
  booksHref,
}: {
  bookId: string;
  /** The Books site's origin when this book is open off that site. */
  booksHref?: string;
}) {
  const { data: backlinks } = api.books.getBacklinks.useQuery({ bookId });
  const { data: related } = api.books.getRelated.useQuery({ bookId });
  const cited = useMemo(
    () => new Set(backlinks?.map((book) => book.id)),
    [backlinks],
  );
  const hasRelated = related?.some((book) => !cited.has(book.id));

  if (!backlinks?.length && !hasRelated) return null;
  return (
    <div data-book-notes-end className="mt-20">
      <NotesEndBreak />
      <div className="mt-16 flex flex-col gap-12">
        {backlinks && <BookBacklinks books={backlinks} booksHref={booksHref} />}
        <RelatedBooks bookId={bookId} booksHref={booksHref} exclude={cited} />
      </div>
    </div>
  );
}

/**
 * A break, so the lists read as after the notes, not part of them: five
 * 12x3 pills, three over two, the lower pair centred under the gaps above
 * like courses of brick.
 */
function NotesEndBreak() {
  return (
    <div
      aria-hidden
      data-notes-end-break
      className="flex flex-col items-center gap-1.5 text-muted-foreground/[0.175]"
    >
      {[3, 2].map((count) => (
        <div key={count} className="flex gap-1.5">
          {Array.from({ length: count }, (_, pill) => (
            <span key={pill} className="h-[3px] w-3 rounded-full bg-current" />
          ))}
        </div>
      ))}
    </div>
  );
}
