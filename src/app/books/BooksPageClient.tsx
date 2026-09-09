"use client";

import {
  BooksIcon,
  ChartBarIcon,
  HouseLineIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Book, BookStats } from "~/lib/books/types";
import { cn, devBaseUrl } from "~/lib/util";

import { BookFilters } from "./components/BookFilters";
import { BookSize } from "./components/BookSize";
import { BooksControls } from "./components/BooksControls";
import { BooksGrid } from "./components/BooksGrid";
import { ReadingStatsPopover } from "./components/ReadingStatsPopover";
import { ZoomOutButton } from "./components/ZoomOutButton";
import { BOOKS_SIDEBAR_WIDTH_CLASS } from "./components/booksShell";
import { FontToggle } from "~/components/ui/font-toggle";
import { ThemeToggle } from "~/components/ui/theme-toggle";

type BooksPageClientProps = {
  initialBooks: Book[];
  initialTags: string[];
  initialStats: BookStats;
};

export default function BooksPageClient({
  initialBooks,
  initialTags,
  initialStats,
}: BooksPageClientProps) {
  const [isHovered, setIsHovered] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState(32);
  const [zoomOutWidth, setZoomOutWidth] = useState<number | null>(null);
  const [bookCount, setBookCount] = useState(0);
  // Seamless-grid preference for zoom-out mode. It survives leaving and
  // re-entering zoom-out but never applies to the normal shelf.
  const [hideHeaders, setHideHeaders] = useState(false);

  const handleZoomToggle = useCallback((width: number | null) => {
    setZoomOutWidth(width);
  }, []);

  const handleBookCountChange = useCallback((count: number) => {
    setBookCount(count);
  }, []);

  useEffect(() => {
    const calculateStickyTop = () => {
      if (sidebarRef.current) {
        const sidebarHeight = sidebarRef.current.offsetHeight;
        const viewportHeight = window.innerHeight;
        const topOffset = 32;
        const bottomOffset = 32;

        if (sidebarHeight + topOffset + bottomOffset > viewportHeight) {
          setStickyTop(viewportHeight - sidebarHeight - bottomOffset);
        } else {
          setStickyTop(topOffset);
        }
      }
    };

    calculateStickyTop();
    window.addEventListener("resize", calculateStickyTop);

    // Watch for sidebar content changes (e.g., when tags load)
    const resizeObserver = new ResizeObserver(calculateStickyTop);
    if (sidebarRef.current) {
      resizeObserver.observe(sidebarRef.current);
    }

    return () => {
      window.removeEventListener("resize", calculateStickyTop);
      resizeObserver.disconnect();
    };
  }, []);

  const isZoomOut = zoomOutWidth !== null;

  return (
    <div
      className={cn(
        "m-auto flex flex-col gap-8",
        !isZoomOut && "max-w-screen-2xl",
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Link
            href={
              process.env.NODE_ENV === "production"
                ? "https://www.chappyasel.com"
                : devBaseUrl()
            }
            className="group inline-flex items-center gap-2 text-2xl font-semibold text-foreground transition-opacity hover:opacity-80 md:text-4xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span className="relative inline-flex h-6 w-6 items-center justify-center md:h-8 md:w-9">
              <AnimatePresence mode="wait" initial={false}>
                {isHovered ? (
                  <motion.div
                    key="house-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <HouseLineIcon
                      className="h-6 w-6 md:h-8 md:w-9"
                      weight="bold"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="book-icon"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BooksIcon
                      className="h-6 w-6 md:h-8 md:w-9"
                      weight="bold"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
            <span className="line-clamp-1">
              Chappy&apos;s<span className="hidden sm:inline"> Book</span> Notes
            </span>
          </Link>
          <div className="flex translate-x-3 items-center gap-0">
            <ReadingStatsPopover
              scope="all"
              align="end"
              triggerClassName="flex size-10 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground"
            >
              <ChartBarIcon className="size-4" weight="bold" />
            </ReadingStatsPopover>
            <ThemeToggle />
            <FontToggle />
            <BookSize />
            <ZoomOutButton
              totalBooks={bookCount}
              isActive={isZoomOut}
              onToggle={handleZoomToggle}
            />
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8 2xl:gap-16">
        {/* Desktop Filters Sidebar - hidden in zoom-out mode */}
        {!isZoomOut && (
          <aside
            ref={sidebarRef}
            className={cn(
              "hidden shrink-0 self-start sm:sticky sm:block",
              BOOKS_SIDEBAR_WIDTH_CLASS,
            )}
            style={{ top: stickyTop }}
          >
            <BookFilters
              initialTags={initialTags}
              initialStats={initialStats}
            />
          </aside>
        )}

        {/* Main Content */}
        <main className="flex flex-1 flex-col gap-6">
          <BooksControls
            isZoomOut={isZoomOut}
            initialTags={initialTags}
            initialStats={initialStats}
            hideHeaders={hideHeaders}
            onHideHeadersChange={setHideHeaders}
          />
          <BooksGrid
            initialBooks={initialBooks}
            zoomOutWidth={zoomOutWidth}
            hideHeaders={isZoomOut && hideHeaders}
            onBookCountChange={handleBookCountChange}
          />
        </main>
      </div>
    </div>
  );
}
