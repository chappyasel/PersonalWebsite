"use client";

import { BookDetailContent } from "../components/BookDetailContent";
import { motion } from "framer-motion";
import { useRef, useState } from "react";

import { getBookShareUrl } from "~/lib/books/paths";
import type { BookWithNotes } from "~/lib/books/types";

type BookPageProps = {
  bookId: string;
  book: BookWithNotes;
};

export function BookPage({ bookId, book }: BookPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Handle share button click
  const handleShare = async () => {
    const shareUrl = getBookShareUrl(bookId);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="fixed inset-0 bg-background">
      <motion.div
        className="flex h-full flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Content Container */}
        <div className="flex h-full flex-col overflow-hidden bg-background">
          <BookDetailContent
            book={book}
            fullBook={book}
            isLoadingNotes={false}
            contentRef={contentRef}
            onShare={handleShare}
            copied={copied}
            bookId={bookId}
          />
        </div>
      </motion.div>
    </div>
  );
}
