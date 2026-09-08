"use client";

import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import {
  PAGE_BUCKET_LABELS,
  RUNTIME_BUCKET_LABELS,
  compareBucketLabels,
  getPageBucket,
  getRuntimeBucket,
} from "../lib/format";
import { searchParamsParsers } from "../lib/searchParams";
import { resolveSort } from "../lib/sort";
import { useIsRestoring } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import {
  compareColorLabels,
  coverColorLabel,
  orderByCoverColor,
} from "~/lib/books/coverColor";
import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

import { BookCard } from "./BookCard";
import { BooksGridSkeleton } from "./BooksGridSkeleton";
import { EmptyState } from "./EmptyState";
import { ReadingStatsPopover } from "./ReadingStatsPopover";
import { cn } from "@/src/lib/util";

// Size to preferred width mapping
const sizeWidths = {
  S: "110px",
  M: "170px",
  L: "260px",
} as const;

type BooksGridProps = {
  initialBooks: Book[];
  zoomOutWidth?: number | null;
  /** Drop the section headers and lay every book out in one grid, in sort
   * order. Sections otherwise break the grid at each header. */
  hideHeaders?: boolean;
  onBookCountChange?: (count: number) => void;
};

export function BooksGrid({
  initialBooks,
  zoomOutWidth,
  hideHeaders = false,
  onBookCountChange,
}: BooksGridProps) {
  const [params, setParams] = useQueryStates(searchParamsParsers);
  const isRestoring = useIsRestoring();

  // Track scrolling state for conditional animations
  // When scrolling, skip enter animations (items appear instantly)
  // When filter/sort changes, animate items in
  const [isScrolling, setIsScrolling] = useState(false);
  const dataVersionRef = useRef(0);

  // Ref for virtuoso scroll control
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Reset scroll flag when filters/sort change (data change = should animate)
  useEffect(() => {
    dataVersionRef.current++;
    setIsScrolling(false);
  }, [
    params.tags,
    params.minRating,
    params.hasNotes,
    params.hasSummary,
    params.isReread,
    params.abandoned,
    params.search,
    params.sort,
    params.order,
  ]);

  // Parse sort parameters (handles legacy combined "field-order" links)
  const [sortField, sortOrder] = resolveSort(params.sort, params.order);

  // Get preferred width based on size or zoom-out width
  const isZoomOut = zoomOutWidth != null && zoomOutWidth > 0;
  const preferredWidth = isZoomOut
    ? `${zoomOutWidth}px`
    : (sizeWidths[(params.size as keyof typeof sizeWidths) ?? "M"] ??
      sizeWidths.M);

  // Determine effective size for BookCard styling
  const effectiveSize: "XS" | "S" | "M" | "L" = isZoomOut
    ? "XS"
    : ((params.size as "S" | "M" | "L") ?? "M");

  // Fetch ALL books once (no filters, no pagination)
  const { data: allBooks, isLoading } = api.books.getAll.useQuery(
    {
      // No filters - get everything
      sortField: "finished",
      sortOrder: "desc",
      limit: 500, // Get all books
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      initialData: initialBooks,
    },
  );

  const handleClearFilters = () => {
    void setParams({
      tags: [],
      minRating: null,
      hasNotes: null,
      hasSummary: null,
      isReread: null,
      abandoned: null,
      search: "",
    });
  };

  // Client-side filtering and sorting (memoized to allow useEffect before early returns)
  const books = useMemo(() => {
    if (!allBooks || allBooks.length === 0) return [];

    // In zoom-out mode, skip filtering (show all books)
    let filteredBooks = allBooks;

    // Abandoned books are hidden by default (even in zoom-out); the toggle
    // includes them alongside everything else. Not an ordinary narrowing
    // filter, so it sits outside the zoom-out skip.
    if (!params.abandoned) {
      filteredBooks = filteredBooks.filter((book) => book.abandoned === null);
    }

    if (!isZoomOut) {
      // Filter by tags
      if (params.tags.length > 0) {
        filteredBooks = filteredBooks.filter((book) =>
          params.tags.some((tag) => book.tags.includes(tag)),
        );
      }

      // Filter by minimum rating
      if (params.minRating) {
        filteredBooks = filteredBooks.filter(
          (book) => book.rating && book.rating >= params.minRating!,
        );
      }

      // Filter by has notes
      if (params.hasNotes !== null && params.hasNotes !== undefined) {
        filteredBooks = filteredBooks.filter(
          (book) => book.hasNotes === params.hasNotes,
        );
      }

      // Filter by has summary
      if (params.hasSummary !== null && params.hasSummary !== undefined) {
        filteredBooks = filteredBooks.filter(
          (book) => book.hasSummary === params.hasSummary,
        );
      }

      // Filter by re-reads (show only the re-read events, not the first read)
      if (params.isReread !== null && params.isReread !== undefined) {
        filteredBooks = filteredBooks.filter((book) => book.readNumber > 1);
      }

      // Filter by search query
      if (params.search) {
        const searchLower = params.search.toLowerCase();
        filteredBooks = filteredBooks.filter(
          (book) =>
            book.title.toLowerCase().includes(searchLower) ||
            book.author.toLowerCase().includes(searchLower),
        );
      }
    }

    // Client-side sorting (still applies in zoom-out mode). Color is not a
    // key sort: it walks a smooth path through each color family.
    if (sortField === "color") {
      return orderByCoverColor(filteredBooks, sortOrder);
    }

    return [...filteredBooks].sort((a, b) => {
      let aValue: string | number | null;
      let bValue: string | number | null;

      if (sortField === "finished") {
        // End date is finished, or abandoned for drops; currently reading
        // (neither) counts as today
        const today = new Date().toISOString();
        aValue = a.finished ?? a.abandoned ?? today;
        bValue = b.finished ?? b.abandoned ?? today;
      } else if (sortField === "rating") {
        aValue = a.rating ?? 0;
        bValue = b.rating ?? 0;
      } else if (sortField === "publicationYear") {
        // Null publication years sort to the end
        const nullValue = sortOrder === "desc" ? -Infinity : Infinity;
        aValue = a.publicationYear ?? nullValue;
        bValue = b.publicationYear ?? nullValue;
      } else if (sortField === "runtime") {
        // Null runtimes sort to the end
        const nullValue = sortOrder === "desc" ? -Infinity : Infinity;
        aValue = a.audioLengthMin ?? nullValue;
        bValue = b.audioLengthMin ?? nullValue;
      } else if (sortField === "pageCount") {
        // Null page counts sort to the end
        const nullValue = sortOrder === "desc" ? -Infinity : Infinity;
        aValue = a.pageCount ?? nullValue;
        bValue = b.pageCount ?? nullValue;
      } else {
        aValue = a.title;
        bValue = b.title;
      }

      // Compare values
      let comparison = 0;
      if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else {
        comparison = (aValue as number) - (bValue as number);
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [
    allBooks,
    isZoomOut,
    params.tags,
    params.minRating,
    params.hasNotes,
    params.hasSummary,
    params.isReread,
    params.abandoned,
    params.search,
    sortField,
    sortOrder,
  ]);

  // Report total book count to parent (for zoom-out button calculation)
  // We use allBooks.length since zoom-out mode shows ALL books regardless of filters
  useEffect(() => {
    onBookCountChange?.(allBooks?.length ?? 0);
  }, [allBooks?.length, onBookCountChange]);

  // Initialize keyboard navigation
  const { focusedBookId, showFocusIndicator, copyTrigger, setHoveredBookId } =
    useKeyboardNavigation({
      books,
      isZoomOut,
    });

  // Scroll focused book into view with padding buffer (keyboard navigation only)
  useEffect(() => {
    if (!focusedBookId || isZoomOut || !showFocusIndicator) return;

    const focusedElement = document.querySelector(
      `[data-book-id="${focusedBookId}"]`,
    );
    if (!focusedElement) return;

    const rect = focusedElement.getBoundingClientRect();
    const padding = 150; // Buffer space at top and bottom

    // Check if element is above visible area (with padding)
    if (rect.top < padding) {
      const scrollAmount = rect.top - padding;
      // Only scroll if we can actually scroll up (not already at top)
      if (window.scrollY > 0 && scrollAmount < -30) {
        window.scrollBy({ top: scrollAmount, behavior: "smooth" });
      }
    }
    // Check if element is below visible area (with padding)
    else if (rect.bottom > window.innerHeight - padding) {
      const scrollAmount = rect.bottom - window.innerHeight + padding;
      // Only scroll if it's a meaningful amount
      if (scrollAmount > 30) {
        window.scrollBy({ top: scrollAmount, behavior: "smooth" });
      }
    }
  }, [focusedBookId, isZoomOut, showFocusIndicator]);

  // Only show loading skeleton when restoring cache or loading without any data
  // Once we have cached data, show it immediately (background refetch won't show skeleton)
  if ((isRestoring || isLoading) && !allBooks) {
    return (
      <BooksGridSkeleton
        size={isZoomOut ? "S" : ((params.size as "S" | "M" | "L") ?? "M")}
      />
    );
  }

  if (!allBooks || allBooks.length === 0) {
    return <EmptyState type="no-books" onClearFilters={handleClearFilters} />;
  }

  // Check if filters resulted in no books
  if (books.length === 0) {
    const hasFilters =
      params.tags.length > 0 ||
      (params.minRating ??
        params.hasNotes ??
        params.hasSummary ??
        params.isReread ??
        params.search) !== null;

    return (
      <EmptyState
        type={hasFilters ? "no-results" : "no-books"}
        onClearFilters={handleClearFilters}
      />
    );
  }

  // Group books based on sort field
  const groupedBooks = books.reduce(
    (acc, book) => {
      let groupKey: string;

      if (sortField === "finished") {
        // Group by end-date year (abandoned counts as the end for drops);
        // currently reading books go in the current year
        const endDate = book.finished ?? book.abandoned;
        const date = endDate ? new Date(endDate) : new Date();
        const year = date.getFullYear();
        groupKey = year.toString();
      } else if (sortField === "rating" && book.rating) {
        // Group by rating
        groupKey = `${book.rating} ${book.rating === 1 ? "star" : "stars"}`;
      } else if (sortField === "publicationYear") {
        // Group by publication year
        groupKey = book.publicationYear?.toString() ?? "Unknown";
      } else if (sortField === "runtime") {
        // Group by runtime bucket
        groupKey = getRuntimeBucket(book.audioLengthMin);
      } else if (sortField === "pageCount") {
        // Group by page count bucket
        groupKey = getPageBucket(book.pageCount);
      } else if (sortField === "title") {
        // Group by first letter, combine non-letters into "#"
        const firstChar = book.title[0]?.toUpperCase();
        if (firstChar && /[A-Z]/.test(firstChar)) {
          groupKey = firstChar;
        } else {
          groupKey = "#";
        }
      } else if (sortField === "color") {
        groupKey = coverColorLabel(book.coverColor);
      } else {
        groupKey = "Other";
      }

      acc[groupKey] ??= [];
      acc[groupKey]!.push(book);
      return acc;
    },
    {} as Record<string, typeof books>,
  );

  // Get sorted group keys
  const groupKeys = Object.keys(groupedBooks).sort((a, b) => {
    if (sortField === "finished") {
      // Sort years numerically
      return sortOrder === "desc"
        ? Number(b) - Number(a)
        : Number(a) - Number(b);
    } else if (sortField === "rating") {
      // Sort ratings numerically, "Other" always last
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      const ratingA = parseInt(a);
      const ratingB = parseInt(b);
      return sortOrder === "desc" ? ratingB - ratingA : ratingA - ratingB;
    } else if (sortField === "publicationYear") {
      // Sort years numerically, "Unknown" always last
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return sortOrder === "desc"
        ? Number(b) - Number(a)
        : Number(a) - Number(b);
    } else if (sortField === "runtime") {
      return compareBucketLabels(RUNTIME_BUCKET_LABELS, a, b, sortOrder);
    } else if (sortField === "pageCount") {
      return compareBucketLabels(PAGE_BUCKET_LABELS, a, b, sortOrder);
    } else if (sortField === "color") {
      return compareColorLabels(a, b, sortOrder);
    } else {
      // Sort alphabetically, "#" always first
      if (a === "#") return -1;
      if (b === "#") return 1;
      return sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    }
  });

  // Create sections array for virtualization. Without headers there is one
  // section holding the whole sorted list, so the grid never breaks a row.
  const sections = hideHeaders
    ? [{ key: "all", books }]
    : groupKeys.map((key) => ({
        key,
        books: groupedBooks[key]!,
      }));

  // Shared section renderer
  const renderSection = (section: (typeof sections)[number]) => (
    <div key={section.key} className="flex flex-col gap-4 pb-8">
      {/* Section Header — year headers get a stats popover */}
      {!hideHeaders && (
        <h2 className="text-2xl font-semibold text-foreground">
          {sortField === "finished" ? (
            <ReadingStatsPopover scope={section.key}>
              {section.key}
            </ReadingStatsPopover>
          ) : (
            section.key
          )}
          <span className="ml-1 inline-block -translate-y-0.5 text-sm text-muted-foreground">
            ({section.books.length})
          </span>
        </h2>
      )}

      {/* Books Grid with AnimatePresence preserved */}
      <motion.div
        data-books-grid
        {...(!isZoomOut && { layout: true })}
        className={cn("grid gap-4", isZoomOut && "gap-2")}
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(${preferredWidth}, calc((100% - 1rem) / 2)), 1fr))`,
        }}
      >
        <AnimatePresence mode="popLayout">
          {section.books.map((book) => {
            const isFocused = book.id === focusedBookId;
            return (
              <motion.div
                key={book.id}
                {...(!isZoomOut && { layout: true })}
                // Conditional initial: skip animation during scroll/zoom, animate on filter/sort
                initial={
                  isScrolling || isZoomOut
                    ? { opacity: 1, scale: 1, y: 0 } // Match animate = no animation
                    : { opacity: 0, scale: 0.9, y: -10 } // Animate on data change
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 20 }}
                transition={{
                  layout: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  y: { duration: 0.15 },
                }}
              >
                <BookCard
                  book={book}
                  size={effectiveSize}
                  isKeyboardFocused={Boolean(isFocused && showFocusIndicator)}
                  keyboardCopyTrigger={
                    isFocused && showFocusIndicator ? copyTrigger : 0
                  }
                  onHover={setHoveredBookId as (bookId: string | null) => void}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  // In zoom-out mode, render all sections without virtualization
  if (isZoomOut) {
    return <div className="flex flex-col">{sections.map(renderSection)}</div>;
  }

  // Normal mode with virtualization
  return (
    <Virtuoso
      ref={virtuosoRef}
      useWindowScroll
      data={sections}
      isScrolling={setIsScrolling}
      overscan={200} // Buffer pixels above/below viewport
      initialItemCount={1}
      itemContent={(_, section) => renderSection(section)}
    />
  );
}
