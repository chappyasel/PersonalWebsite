"use client";

import { motion } from "framer-motion";
import Image from "next/image";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";

import { BookMetadataSeparator } from "~/components/books/BookMetadataSeparator";

import { cn } from "@/src/lib/util";

/**
 * The cover a book row leads with: 56px wide, the sampled jacket color
 * behind it while the image loads. `layoutId` lets a book view grow out of
 * it the way it grows out of a shelf cover.
 */
export function BookRowCover({
  book,
  layoutId,
}: {
  book: Pick<Book, "coverUrl" | "coverColor">;
  layoutId?: string;
}) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  return (
    <motion.div
      layoutId={layoutId}
      className={cn(
        "relative mt-0.5 aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-[3px] shadow-sm",
        !book.coverColor &&
          "bg-gradient-to-b from-stone-500/20 to-stone-700/20",
      )}
      style={book.coverColor ? { backgroundColor: book.coverColor } : undefined}
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
  );
}

/** Title over author and year, the order the cover overlay uses. */
export function BookRowTitle({
  book,
}: {
  book: Pick<Book, "title" | "author" | "publicationYear">;
}) {
  return (
    <>
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
    </>
  );
}
