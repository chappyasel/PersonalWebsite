"use client";

import { searchParamsParsers } from "../lib/searchParams";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryStates } from "nuqs";

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
      search: "",
    });
  };

  // Only show loading skeleton on initial load (when we have no data yet)
  if (isLoading) {
    return <BooksGridSkeleton size={(params.size as "S" | "M" | "L") ?? "M"} />;
  }

  if (!allBooks || allBooks.length === 0) {
    return (
      <EmptyState type="no-books" onClearFilters={handleClearFilters} />
    );
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
      aValue = a.finished ?? "";
      bValue = b.finished ?? "";
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
      (params.minRating ?? params.hasNotes ?? params.search);

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

      if (sortField === "finished" && book.finished) {
        // Group by year
        const year = new Date(book.finished).getFullYear();
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

      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey]!.push(book);
      return acc;
    },
    {} as Record<string, typeof books>,
  );

  // Get sorted group keys
  const groupKeys = Object.keys(groupedBooks).sort((a, b) => {
    if (sortField === "finished") {
      // Sort years numerically descending
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

  return (
    <>
      <div className="flex flex-col gap-8">
        {groupKeys.map((groupKey) => (
          <div key={groupKey} className="flex flex-col gap-4">
            {/* Section Header */}
            <h2 className="text-2xl font-bold text-foreground">
              {groupKey}
              <span className="text-sm text-foreground/70">
                {" "}
                ({groupedBooks[groupKey]!.length})
              </span>
            </h2>

            {/* Books Grid */}
            <motion.div
              layout
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(${preferredWidth}, calc((100% - 1rem) / 2)), 1fr))`,
              }}
            >
              <AnimatePresence mode="popLayout">
                {groupedBooks[groupKey]!.map((book) => (
                  <motion.div
                    key={book.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{
                      layout: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.2 },
                      scale: { duration: 0.2 },
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
        ))}
      </div>
    </>
  );
}
