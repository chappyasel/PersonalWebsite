"use client";

import { type ComponentType, useEffect, useRef, useState } from "react";

import type { HomepageBookCover } from "~/lib/books/types";

export function DeferredBookCarousel({
  books,
}: {
  books: HomepageBookCover[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [BookCarousel, setBookCarousel] = useState<ComponentType<{
    books: HomepageBookCover[];
  }> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || BookCarousel) return;
    let cancelled = false;
    void import("./BookCarousel").then((module) => {
      if (!cancelled) setBookCarousel(() => module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [nearViewport, BookCarousel]);

  return (
    <div ref={ref} className="size-full">
      {nearViewport && BookCarousel ? (
        <BookCarousel books={books} />
      ) : (
        <div
          className="flex size-full flex-col justify-center gap-3 overflow-hidden py-3"
          aria-hidden="true"
        >
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-3 overflow-hidden">
              {Array.from({ length: 9 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[134px] w-[89px] shrink-0 rounded-lg bg-foreground/[0.06]"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
