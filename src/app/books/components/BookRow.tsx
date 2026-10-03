"use client";

import { motion, useMotionValue } from "framer-motion";
import Image from "next/image";

import { bookCoverShadow } from "~/lib/books/coverShadow";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";

import { BookMetadataSeparator } from "~/components/books/BookMetadataSeparator";

import { DetailCoverTilt } from "./DetailCoverTilt";
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

// The book view's header cover once it has folded (BookDetailContent): a
// 4px corner and a quarter of the resting shadow.
const FOLDED_RADIUS = "4px";
const FOLDED_SHADOW_SIZE = 0.25;

/**
 * A row cover drawn as the book view's folded header cover: the same
 * radius and shadow, and on hover the same lift and tilt toward the
 * pointer, or none where that header has none (reduced motion, touch, the
 * effect switched off). Its box is `[data-book-row-cover]`, which a book
 * view opened from the row flies out of.
 */
export function BookRowTiltCover({
  book,
}: {
  book: Pick<Book, "coverUrl" | "coverColor">;
}) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const borderRadius = useMotionValue(FOLDED_RADIUS);
  const shadowSize = useMotionValue(FOLDED_SHADOW_SIZE);
  const restingShadow = useMotionValue(
    bookCoverShadow(0, 0, 1, FOLDED_SHADOW_SIZE),
  );
  return (
    <div data-book-row-cover className="mt-0.5 aspect-[2/3] w-14 shrink-0">
      <DetailCoverTilt
        borderRadius={borderRadius}
        shadowSize={shadowSize}
        restingShadow={restingShadow}
      >
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-[4px]",
            !book.coverColor &&
              "bg-gradient-to-b from-stone-500/20 to-stone-700/20",
          )}
          style={
            book.coverColor ? { backgroundColor: book.coverColor } : undefined
          }
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
        </div>
      </DetailCoverTilt>
    </div>
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
