"use client";

import { searchParamsParsers } from "../lib/searchParams";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { useIsRestoring } from "@tanstack/react-query";

import { api } from "~/trpc/react";

import { BookCard } from "./BookCard";
import { BooksGridSkeleton } from "./BooksGridSkeleton";
import { EmptyState } from "./EmptyState";

// Size to preferred width mapping
const sizeWidths = {
  S: "110px",
  M: "170px",
  L: "260px",
} as const;

export function BooksGrid() {
  const [params, setParams] = useQueryStates(searchParamsParsers);
  const isRestoring = useIsRestoring();

  // Track scrolling state for conditional animations
  // When scrolling, skip enter animations (items appear instantly)
  // When filter/sort changes, animate items in
  const [isScrolling, setIsScrolling] = useState(false);
  const dataVersionRef = useRef(0);

  // Reset scroll flag when filters/sort change (data change = should animate)
  useEffect(() => {
    dataVersionRef.current++;
    setIsScrolling(false);
  }, [
    params.tags,
    params.minRating,
    params.hasNotes,
    params.hasSummary,
    params.search,
    params.sort,
  ]);

  // Parse sort parameter
  const [sortField, sortOrder] = (params.sort ?? "finished-desc").split(
    "-",
  ) as ["finished" | "title" | "rating", "asc" | "desc"];

  // Get preferred width based on size
  const preferredWidth =
    sizeWidths[(params.size as keyof typeof sizeWidths) ?? "M"] ?? sizeWidths.M;

  // Fetch ALL books once (no filters, no pagination)
  const { data: allBooks, isLoading } = api.books.getAll.useQuery(
    {
      // No filters - get everything
      sortField: "finished",
      sortOrder: "desc",
      limit: 500, // Get all books
    },
    {
      // Never refetch - we loaded everything once
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const handleClearFilters = () => {
    void setParams({
      tags: [],
      minRating: null,
      hasNotes: null,
      hasSummary: null,
      search: "",
    });
  };

  // Only show loading skeleton when restoring cache or loading without any data
  // Once we have cached data, show it immediately (background refetch won't show skeleton)
  if (isRestoring || (isLoading && !allBooks)) {
    return <BooksGridSkeleton size={(params.size as "S" | "M" | "L") ?? "M"} />;
  }

  if (!allBooks || allBooks.length === 0) {
    return <EmptyState type="no-books" onClearFilters={handleClearFilters} />;
  }

  // Client-side filtering
  let filteredBooks = allBooks;

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

  // Filter by search query
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filteredBooks = filteredBooks.filter(
      (book) =>
        book.title.toLowerCase().includes(searchLower) ||
        book.author.toLowerCase().includes(searchLower),
    );
  }

  // Client-side sorting
  const books = [...filteredBooks].sort((a, b) => {
    let aValue: string | number | null;
    let bValue: string | number | null;

    if (sortField === "finished") {
      // Treat null finished (currently reading) as today
      const today = new Date().toISOString();
      aValue = a.finished ?? today;
      bValue = b.finished ?? today;
    } else if (sortField === "rating") {
      aValue = a.rating ?? 0;
      bValue = b.rating ?? 0;
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

  // Check if filters resulted in no books
  if (books.length === 0) {
    const hasFilters =
      params.tags.length > 0 ||
      (params.minRating ??
        params.hasNotes ??
        params.hasSummary ??
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
        // Group by year - currently reading books go in current year
        const date = book.finished ? new Date(book.finished) : new Date();
        const year = date.getFullYear();
        groupKey = year.toString();
      } else if (sortField === "rating" && book.rating) {
        // Group by rating
        groupKey = `${book.rating} ${book.rating === 1 ? "star" : "stars"}`;
      } else if (sortField === "title") {
        // Group by first letter, combine non-letters into "#"
        const firstChar = book.title[0]?.toUpperCase();
        if (firstChar && /[A-Z]/.test(firstChar)) {
          groupKey = firstChar;
        } else {
          groupKey = "#";
        }
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
    } else {
      // Sort alphabetically, "#" always first
      if (a === "#") return -1;
      if (b === "#") return 1;
      return sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    }
  });

  // Create sections array for virtualization
  const sections = groupKeys.map((key) => ({
    key,
    books: groupedBooks[key]!,
  }));

  return (
    <Virtuoso
      useWindowScroll
      data={sections}
      isScrolling={setIsScrolling}
      overscan={200} // Buffer pixels above/below viewport
      itemContent={(index, section) => (
        <div key={section.key} className="flex flex-col gap-4 pb-8">
          {/* Section Header */}
          <h2 className="text-2xl font-bold text-foreground">
            {section.key}
            <span className="text-sm text-foreground/70">
              {" "}
              ({section.books.length})
            </span>
          </h2>

          {/* Books Grid with AnimatePresence preserved */}
          <motion.div
            layout
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${preferredWidth}, calc((100% - 1rem) / 2)), 1fr))`,
            }}
          >
            <AnimatePresence mode="popLayout">
              {section.books.map((book) => (
                <motion.div
                  key={book.id}
                  layout
                  // Conditional initial: skip animation during scroll, animate on filter/sort
                  initial={
                    isScrolling
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
                    size={(params.size as "S" | "M" | "L") ?? "M"}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    />
  );
}
