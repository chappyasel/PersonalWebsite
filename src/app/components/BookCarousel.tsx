"use client";

import Image from "next/image";
import React from "react";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

export default function BookCarousel() {
  const {
    data: books,
    isLoading,
    error,
  } = api.books.getAll.useQuery({
    sortField: "finished",
    sortOrder: "desc",
    limit: 60,
  });

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
        aria-hidden="true"
        role="presentation"
      >
        {[1, 2, 3].map((row) => (
          <div key={row} className="w-full overflow-hidden">
            <div className="flex w-fit gap-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[134px] w-[89px] flex-shrink-0 animate-shimmer rounded-lg bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200px_100%]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    console.error("Failed to load books:", error);
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-muted-foreground">Unable to load book covers</p>
      </div>
    );
  }

  // Empty state
  if (!books || books.length === 0) {
    return (
      <div className="flex size-full items-center justify-center">
        <p className="text-muted-foreground">No books to display yet</p>
      </div>
    );
  }

  // Distribute books across three rows
  const distributeBooks = (allBooks: Book[], booksPerRow = 20) => {
    const rows: Book[][] = [[], [], []];

    if (allBooks.length >= booksPerRow * 3) {
      // We have enough books, split evenly
      rows[0] = allBooks.slice(0, booksPerRow);
      rows[1] = allBooks.slice(booksPerRow, booksPerRow * 2);
      rows[2] = allBooks.slice(booksPerRow * 2, booksPerRow * 3);
    } else {
      // Cycle through available books to fill rows
      let bookIndex = 0;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < booksPerRow; i++) {
          if (rows[row]) {
            rows[row]!.push(allBooks[bookIndex % allBooks.length]!);
          }
          bookIndex++;
        }
      }
    }

    return rows;
  };

  const [row1Books, row2Books, row3Books] = distributeBooks(books);

  return (
    <div
      className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
      aria-hidden="true"
      role="presentation"
    >
      {/* Row 1 - Scroll Left */}
      <MarqueeRow books={row1Books!} direction="left" />

      {/* Row 2 - Scroll Right */}
      <MarqueeRow books={row2Books!} direction="right" />

      {/* Row 3 - Scroll Left */}
      <MarqueeRow books={row3Books!} direction="left" />
    </div>
  );
}

function MarqueeRow({
  books,
  direction,
}: {
  books: Book[];
  direction: "left" | "right";
}) {
  const animationClass =
    direction === "left" ? "animate-marquee-left" : "animate-marquee-right";

  return (
    <div className="w-full overflow-visible">
      <div
        className={`flex w-fit gap-3 will-change-transform motion-reduce:animate-none ${animationClass}`}
      >
        {/* Render books twice for seamless loop */}
        {[...books, ...books].map((book, index) => (
          <BookCover key={`${book.id}-${index}`} book={book} />
        ))}
      </div>
    </div>
  );
}

function BookCover({ book }: { book: Book }) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);

  return (
    <div className="relative h-[134px] w-[89px] flex-shrink-0 overflow-hidden rounded-lg shadow-[0_4px_8px_rgba(0,0,0,0.2)] transition-all duration-300 hover:scale-105 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
      <div className="aspect-[2/3] h-full w-full">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={`${book.title} cover`}
            fill
            sizes="89px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10 p-2 text-center">
            <p className="line-clamp-3 text-[10px] font-semibold leading-tight text-foreground">
              {book.title}
            </p>
            <p className="mt-1 line-clamp-2 text-[8px] leading-tight text-muted-foreground">
              {book.author}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
