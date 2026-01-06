"use client";

import { StarIcon } from "@phosphor-icons/react/dist/ssr";
import { FileText } from "lucide-react";
import Image from "next/image";
import { useQueryState } from "nuqs";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";

import { Badge } from "~/components/ui/badge";

type BookCardProps = {
  book: Book;
  size?: "S" | "M" | "L";
};

const sizeRadius = {
  S: "rounded-lg",
  M: "rounded-xl",
  L: "rounded-2xl",
} as const;

const sizeStyles = {
  S: {
    placeholderTitle: "text-xs",
    placeholderAuthor: "text-[10px]",
    badgeText: "text-[10px]",
    badgeIcon: "h-2.5 w-2.5",
    overlayTitle: "text-xs",
    overlayAuthor: "text-[10px]",
    star: "!size-4",
    badgeSpacing: "bottom-1.5 right-1.5",
    overlayPadding: "p-3",
  },
  M: {
    placeholderTitle: "text-sm",
    placeholderAuthor: "text-xs",
    badgeText: "text-xs",
    badgeIcon: "h-3 w-3",
    overlayTitle: "text-sm",
    overlayAuthor: "text-xs",
    star: "!size-[18px]",
    badgeSpacing: "bottom-2 right-2",
    overlayPadding: "p-4",
  },
  L: {
    placeholderTitle: "text-base",
    placeholderAuthor: "text-sm",
    badgeText: "text-sm",
    badgeIcon: "h-3.5 w-3.5",
    overlayTitle: "text-base",
    overlayAuthor: "text-sm",
    star: "!size-5",
    badgeSpacing: "bottom-3 right-3",
    overlayPadding: "p-5",
  },
} as const;

export function BookCard({ book, size = "M" }: BookCardProps) {
  const [, setBookId] = useQueryState("book");
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const styles = sizeStyles[size];

  const handleClick = () => {
    void setBookId(book.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group relative cursor-pointer overflow-hidden ${sizeRadius[size]} shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] transition-all duration-300 hover:rotate-1 hover:scale-105 hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 intersect:motion-scale-in-90 intersect:motion-opacity-in-50`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View details for ${book.title} by ${book.author}`}
    >
      {/* Cover Image (aspect ratio 2:3) */}
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted/20">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={`${book.title} cover`}
            className="h-full w-full object-cover"
            width={1000}
            height={1000}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <p
              className={`line-clamp-3 font-bold text-foreground ${styles.placeholderTitle}`}
            >
              {book.title}
            </p>
            <p
              className={`mt-2 line-clamp-2 text-muted-foreground ${styles.placeholderAuthor}`}
            >
              {book.author}
            </p>
          </div>
        )}
      </div>

      {/* No Notes Badge */}
      {!book.hasNotes && (
        <Badge
          variant="secondary"
          className={`absolute gap-1 bg-red-50/90 text-red-600/80 shadow-md dark:bg-red-950/90 dark:text-red-400/90 ${styles.badgeSpacing}`}
        >
          <FileText className={styles.badgeIcon} />
          <span className={styles.badgeText}>No Notes</span>
        </Badge>
      )}

      {/* Overlay with title/author on hover */}
      <div
        className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100 ${styles.overlayPadding}`}
      >
        <h3
          className={`line-clamp-3 font-bold text-white ${styles.overlayTitle}`}
        >
          {book.title}
        </h3>
        <p className={`line-clamp-1 text-white/80 ${styles.overlayAuthor}`}>
          {book.author}
        </p>
        {book.rating && (
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <StarIcon
                key={i}
                weight={i < book.rating! ? "fill" : "duotone"}
                className={`${styles.star} ${i < book.rating! ? "text-yellow-400" : "text-white/30"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
