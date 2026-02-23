"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  type MotionStyle,
} from "framer-motion";
import React, { useRef } from "react";

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
        style={{
          mask: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMask:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        {[1, 2, 3].map((row) => (
          <div key={row} className="w-full overflow-hidden">
            <div className="flex w-fit gap-3">
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

  // Error or empty state — show static placeholder grid instead of text
  if (error || !books || books.length === 0) {
    if (error) console.error("Failed to load books:", error);
    return (
      <div
        className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
        aria-hidden="true"
        role="presentation"
        style={{
          mask: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMask:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        {[1, 2, 3].map((row) => (
          <div key={row} className="w-full overflow-hidden">
            <div className="flex w-fit gap-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[134px] w-[89px] flex-shrink-0 rounded-lg bg-muted"
                />
              ))}
            </div>
          </div>
        ))}
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
    <motion.div
      className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
      aria-hidden="true"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        mask: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        WebkitMask: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
      }}
    >
      {/* Row 1 - Scroll Left */}
      <MarqueeRow books={row1Books!} direction="left" />

      {/* Row 2 - Scroll Right */}
      <MarqueeRow books={row2Books!} direction="right" />

      {/* Row 3 - Scroll Left */}
      <MarqueeRow books={row3Books!} direction="left" />
    </motion.div>
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

const ROTATE_AMPLITUDE = 12;
const SPRING_CONFIG = { stiffness: 200, damping: 20, mass: 0.5 };

function BookCover({ book }: { book: Book }) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const cardRef = useRef<HTMLDivElement>(null);

  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rotateX = useSpring(rawRotateX, SPRING_CONFIG);
  const rotateY = useSpring(rawRotateY, SPRING_CONFIG);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rawRotateX.set((offsetY / (rect.height / 2)) * -ROTATE_AMPLITUDE);
    rawRotateY.set((offsetX / (rect.width / 2)) * ROTATE_AMPLITUDE);
  };

  const handleMouseLeave = () => {
    rawRotateX.set(0);
    rawRotateY.set(0);
  };

  const motionStyle: MotionStyle = {
    rotateX,
    rotateY,
    willChange: "transform",
    transform: "translateZ(0)",
  };

  return (
    <div
      ref={cardRef}
      className="relative h-[134px] w-[89px] flex-shrink-0 [perspective:800px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transformStyle: "preserve-3d" }}
    >
      <motion.div
        className="h-full w-full overflow-hidden rounded-lg shadow-[0_4px_8px_rgba(0,0,0,0.2)] transition-shadow duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] [transform-style:preserve-3d]"
        style={motionStyle}
      >
        <div className="aspect-[2/3] h-full w-full">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={`${book.title} cover`}
              className="h-full w-full object-cover"
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
      </motion.div>
    </div>
  );
}
