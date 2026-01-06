"use client";

import { BookDetailContent } from "../components/BookDetailContent";
import { useBookPreview } from "../contexts/BookPreviewContext";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";

import { api } from "~/trpc/react";

type BookPageProps = {
  bookId: string;
};

export function BookPage({ bookId }: BookPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const { selectedBook } = useBookPreview();

  // Fetch full book data (with notes)
  const {
    data: fullBook,
    isLoading: isLoadingFull,
    error,
  } = api.books.getById.useQuery(
    { bookId },
    {
      staleTime: Infinity,
    },
  );

  // Use preview data immediately, fall back to fetched data
  const book = selectedBook?.id === bookId ? selectedBook : fullBook;
  const isLoading = !book; // Only show loading if we have no data at all
  const isLoadingNotes = isLoadingFull && !fullBook;

  // Handle share button click
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/books/${bookId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="fixed inset-0 bg-background">
      <motion.div
        className="mx-auto flex h-full max-w-3xl flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Back Button Header */}
        <div className="flex flex-shrink-0 items-center gap-4 p-6">
          <Link
            href="/books"
            className="flex items-center gap-2 text-sm text-foreground transition-colors hover:text-muted-foreground"
          >
            <CaretLeftIcon size={20} weight="bold" />
            <span>Back to Books</span>
          </Link>
        </div>

        {/* Content Container */}
        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          {/* Loading State */}
          {isLoading && (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-title"></div>
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
              <p className="text-center text-muted-foreground">
                Failed to load book details
              </p>
              <Link
                href="/books"
                className="rounded-lg bg-title px-6 py-2 text-background transition-colors hover:bg-body"
              >
                Back to Books
              </Link>
            </div>
          )}

          {/* Content */}
          {book && !isLoading && !error && (
            <BookDetailContent
              book={book}
              fullBook={fullBook}
              isLoadingNotes={isLoadingNotes}
              contentRef={contentRef}
              onShare={handleShare}
              copied={copied}
              bookId={bookId}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
