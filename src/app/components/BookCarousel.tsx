"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  type MotionStyle,
} from "framer-motion";
import Image from "next/image";
import React, { useRef } from "react";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { HomepageBookCover } from "~/lib/books/types";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export default function BookCarousel({
  books,
}: {
  books: HomepageBookCover[];
}) {
  // Error or empty state — show static placeholder grid instead of text
  if (books.length === 0) {
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
        {[1, 2].map((row) => (
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

  // Distribute books across two rows
  const distributeBooks = (
    allBooks: HomepageBookCover[],
    booksPerRow = 20,
  ) => {
    const rows: HomepageBookCover[][] = [[], []];

    if (allBooks.length >= booksPerRow * 2) {
      rows[0] = allBooks.slice(0, booksPerRow);
      rows[1] = allBooks.slice(booksPerRow, booksPerRow * 2);
    } else {
      let bookIndex = 0;
      for (let row = 0; row < 2; row++) {
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

  const [row1Books, row2Books] = distributeBooks(books);

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div
        data-homepage-carousel
        className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
        aria-hidden="true"
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          mask: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMask:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        {/* Row 1 - Scroll Left */}
        <MarqueeRow books={row1Books!} direction="left" />

        {/* Row 2 - Scroll Right */}
        <MarqueeRow books={row2Books!} direction="right" />
      </motion.div>
    </TooltipProvider>
  );
}

function MarqueeRow({
  books,
  direction,
}: {
  books: HomepageBookCover[];
  direction: "left" | "right";
}) {
  const animationClass =
    direction === "left" ? "animate-marquee-left" : "animate-marquee-right";

  return (
    <div className="w-full overflow-visible">
      {/* Two copies, each its OWN flex group, and the outer track carries no
          gap of its own.
          A single row of `[...books, ...books]` with one `gap-3` is the obvious
          way to write this and it does not loop cleanly: 2N covers have 2N-1
          gaps between them, so translating exactly -50% travels N covers plus
          N-0.5 gaps. The track lands half a gap short every cycle — 6px at this
          spacing — and the seam walks across the row.
          Giving each copy a trailing `pr-3` equal to the gap makes one copy
          exactly N covers + N gaps wide, so half the track is a whole copy and
          -50% is seamless by construction rather than by tuning. */}
      <div
        className={`flex w-fit will-change-transform motion-reduce:animate-none ${animationClass}`}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-3 pr-3" aria-hidden={copy === 1}>
            {books.map((book, index) => (
              <BookCover key={`${book.id}-${index}`} book={book} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const ROTATE_AMPLITUDE = 12;
const SPRING_CONFIG = { stiffness: 200, damping: 20, mass: 0.5 };

function BookCover({ book }: { book: HomepageBookCover }) {
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
    <Tooltip>
      <TooltipTrigger asChild>
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
            <div className="relative aspect-[2/3] h-full w-full">
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
          </motion.div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-56">
        <div className="flex flex-col gap-0.5">
          <p className="line-clamp-2 font-semibold leading-snug">
            {book.title}
          </p>
          <p className="line-clamp-1 text-muted-foreground">{book.author}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
