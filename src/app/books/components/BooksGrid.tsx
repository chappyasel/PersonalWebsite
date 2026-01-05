"use client";

import { searchParamsParsers } from "../lib/searchParams";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryState, useQueryStates } from "nuqs";

import { api } from "~/trpc/react";

import { BookCard } from "./BookCard";
import { BookModal } from "./BookModal";
import { BooksGridSkeleton } from "./BooksGridSkeleton";
import { EmptyState } from "./EmptyState";

export function BooksGrid() {
  const [bookId, setBookId] = useQueryState("book");
  const [params, setParams] = useQueryStates(searchParamsParsers);

  // Parse sort parameter
  const [sortField, sortOrder] = (params.sort ?? "finished-desc").split(
    "-",
  ) as ["finished" | "title" | "rating", "asc" | "desc"];

  // Fetch books with filters from URL
  const { data: books, isLoading } = api.books.getAll.useQuery({
    tags: params.tags.length > 0 ? params.tags : undefined,
    minRating: params.minRating ?? undefined,
    yearFinished: params.year ?? undefined,
    hasNotes: params.hasNotes ?? undefined,
    searchQuery: params.search || undefined,
    sortField,
    sortOrder,
  });

  const handleClearFilters = () => {
    void setParams({
      tags: [],
      minRating: null,
      year: null,
      hasNotes: null,
      search: "",
    });
  };

  if (isLoading) {
    return <BooksGridSkeleton />;
  }

  if (!books || books.length === 0) {
    const hasFilters =
      params.tags.length > 0 ||
      (params.minRating ?? params.year ?? params.hasNotes ?? params.search);

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
        // Group by first letter
        groupKey = book.title[0]?.toUpperCase() ?? "?";
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
      // Sort alphabetically
      return sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    }
  });

  return (
    <>
      <div className="flex flex-col gap-8">
        {groupKeys.map((groupKey) => (
          <div key={groupKey} className="flex flex-col gap-4">
            {/* Section Header */}
            <h2 className="text-2xl font-bold text-title">{groupKey}</h2>

            {/* Books Grid */}
            <motion.div
              layout
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-12"
            >
              <AnimatePresence mode="popLayout">
                {groupedBooks[groupKey]!.map((book) => (
                  <motion.div
                    key={book.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BookCard book={book} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        ))}
      </div>

      {/* Global Modal controlled by URL */}
      <BookModal
        bookId={bookId}
        isOpen={!!bookId}
        onClose={() => void setBookId(null)}
      />
    </>
  );
}
