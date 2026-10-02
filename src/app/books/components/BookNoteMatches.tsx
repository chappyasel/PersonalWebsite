"use client";

import { useModalActions } from "../contexts/BookPreviewContext";
import { useBookPath } from "../hooks/useBookPath";
import { noteMatchHref } from "../lib/noteMatchLink";
import { motion } from "framer-motion";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { NoteExcerptSegment } from "~/lib/books/notesSearch";
import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

import { BookMetadataSeparator } from "~/components/books/BookMetadataSeparator";
import { loadFullPageOnSmallViewport } from "~/components/modal-sheet/sheetRoute";
import { SearchMark } from "~/components/ui/search-mark";

import { BOOK_MODAL_HISTORY_STATE } from "./modalHistory";
import { cn } from "@/src/lib/util";

export type BookNoteRow = {
  book: Book;
  excerpt: NoteExcerptSegment[];
  /** The chapter or takeaway the excerpt came from; the row opens there. */
  anchor: string | null;
};

type BookNoteMatchesProps = {
  rows: BookNoteRow[];
  /** The server has not answered for the current query yet. Rows, if any,
   * belong to the previous query and are drawn dimmed. */
  isSearching: boolean;
  focusedBookId: string | null;
  showFocusIndicator: boolean;
  onHover: (bookId: string | null) => void;
};

/**
 * The second half of a shelf search: books whose notes mention the query,
 * listed under the covers that matched by title or author. Rows, not covers,
 * because the passage that explains the match needs a line of its own.
 */
export function BookNoteMatches({
  rows,
  isSearching,
  focusedBookId,
  showFocusIndicator,
  onHover,
}: BookNoteMatchesProps) {
  return (
    <section
      data-book-note-matches
      aria-busy={isSearching}
      className="flex flex-col gap-2 pb-8"
    >
      <h2 className="text-2xl font-semibold text-foreground">
        Mentioned in notes
        {rows.length > 0 && (
          <span className="ml-1 inline-block -translate-y-0.5 text-sm text-muted-foreground">
            ({rows.length})
          </span>
        )}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          Searching notes
        </p>
      ) : (
        <ul
          className={cn(
            "-mx-2 flex max-w-4xl flex-col transition-opacity duration-150",
            isSearching && "opacity-50",
          )}
        >
          {rows.map((row) => (
            <li key={row.book.id}>
              <BookNoteMatchRow
                row={row}
                isKeyboardFocused={
                  showFocusIndicator && row.book.id === focusedBookId
                }
                onHover={onHover}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookNoteMatchRow({
  row: { book, excerpt, anchor },
  isKeyboardFocused,
  onHover,
}: {
  row: BookNoteRow;
  isKeyboardFocused: boolean;
  onHover: (bookId: string | null) => void;
}) {
  const { openModal } = useModalActions();
  const searchParams = useSearchParams();
  const bookPath = useBookPath();
  const utils = api.useUtils();
  const rowRef = useRef<HTMLButtonElement>(null);
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  // The book view scrolls to the chapter once its notes load, opening a
  // folded takeaway if that is where the passage lives, and marks the
  // search there for a few seconds.
  const bookUrl = noteMatchHref(
    bookPath,
    book.id,
    searchParams.toString(),
    anchor,
  );

  // The same open a cover performs (BookCard.handleClick).
  const handleClick = () => {
    rowRef.current?.blur();
    if (loadFullPageOnSmallViewport(bookUrl, { source: rowRef.current }))
      return;
    openModal(book, "S");
    window.history.pushState(BOOK_MODAL_HISTORY_STATE, "", bookUrl);
  };

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={handleClick}
      onMouseEnter={() => {
        onHover(book.id);
        void utils.books.getById.prefetch({ bookId: book.id });
      }}
      onMouseLeave={() => onHover(null)}
      aria-label={`View details for ${book.title} by ${book.author}`}
      data-book-id={book.id}
      data-keyboard-focused={isKeyboardFocused}
      className={cn(
        "flex w-full cursor-pointer items-start gap-4 rounded-md p-2 text-left outline-none transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60",
        isKeyboardFocused && "bg-secondary/60 ring-2 ring-primary",
      )}
    >
      {/* Shares the cover's layoutId so the book view grows out of the
          thumbnail the way it grows out of a cover on the shelf. A book is
          drawn once per search, as a cover or as a row, never both. */}
      <motion.div
        layoutId={`book-cover-${book.id}`}
        className={cn(
          "relative mt-0.5 aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-[3px] shadow-sm",
          !book.coverColor &&
            "bg-gradient-to-b from-stone-500/20 to-stone-700/20",
        )}
        style={
          book.coverColor ? { backgroundColor: book.coverColor } : undefined
        }
        transition={{
          layout: { type: "spring", stiffness: 300, damping: 30 },
        }}
      >
        {coverUrl && (
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="56px"
            className="h-full w-full select-none object-cover"
            draggable="false"
          />
        )}
      </motion.div>
      {/* Title over author and year, the order the cover overlay uses. */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold leading-tight text-foreground">
          {book.title}
        </h3>
        <p className="flex min-w-0 items-baseline pt-0.5 text-sm text-muted-foreground">
          <span className="min-w-0 truncate">{book.author}</span>
          {book.publicationYear && (
            <span className="shrink-0 whitespace-nowrap">
              <BookMetadataSeparator />
              <span aria-label={`Published ${book.publicationYear}`}>
                {book.publicationYear}
              </span>
            </span>
          )}
        </p>
        <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
          {excerpt.map((segment, index) =>
            segment.match ? (
              <SearchMark key={index}>{segment.text}</SearchMark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      </div>
    </button>
  );
}
