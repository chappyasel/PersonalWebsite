"use client";

import { useModalActions, useModalState } from "../contexts/BookPreviewContext";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { getBookPath, getBookShareUrl } from "~/lib/books/paths";
import { api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { BookDetailContent } from "./BookDetailContent";

export function Modal() {
  const { selectedBook, selectedBookId, isModalOpen } = useModalState();
  const { closeModal } = useModalActions();
  const [copied, setCopied] = useState(false);
  const isClosingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const bookId = selectedBookId ?? "";

  // Fetch full book data (with notes)
  const {
    data: fullBook,
    isLoading: isLoadingFull,
    error,
  } = api.books.getById.useQuery(
    { bookId },
    {
      enabled: !!bookId && isModalOpen,
      staleTime: Infinity,
    },
  );

  // Use preview data immediately, fall back to fetched data
  const book = selectedBook ?? fullBook;
  const isLoadingNotes = isLoadingFull && !fullBook;

  const handleClose = () => {
    // Prevent double-close during exit animation (ref updates synchronously)
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    // Blur active element to prevent focus ring on book card
    (document.activeElement as HTMLElement)?.blur();
    closeModal();
    // Navigate back to remove the bookId from URL
    window.history.back();
  };

  // Reset isClosing when modal reopens
  useEffect(() => {
    if (isModalOpen) {
      isClosingRef.current = false;
    }
  }, [isModalOpen]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isModalOpen]);

  // Handle keyboard shortcuts (ESC to close, Enter for full page)
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if photo viewer is open (react-photo-view adds this class to body)
      const photoViewOpen = document.querySelector(".PhotoView-Portal");

      if (e.key === "Escape" && !photoViewOpen) {
        handleClose();
      } else if (e.key === "Enter" && !photoViewOpen && bookId) {
        // Navigate to full page view
        e.preventDefault();
        window.location.href = getBookPath(bookId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, bookId]);

  // Handle share button click
  const handleShare = async () => {
    if (!bookId) return;
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
    <AnimatePresence>
      {isModalOpen && bookId && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm dark:bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            onClick={handleClose}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="relative w-full max-w-4xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Animated placeholder - morphs from book cover */}
                <motion.div
                  layoutId={`book-cover-${bookId}`}
                  className={`absolute inset-0 rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:bg-muted ${book?.hasNotes ? "h-[max(85vh,min(1000px,calc(100vh-32px)))]" : "max-h-[85vh]"}`}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                />
                {/* Actual content - fades in on top */}
                <motion.div
                  className={`relative overflow-hidden rounded-2xl bg-background dark:bg-muted ${book?.hasNotes ? "h-[max(85vh,min(1000px,calc(100vh-32px)))]" : "max-h-[85vh]"}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, delay: 0.1 }}
                >
                  {/* Content */}
                  {error ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                      <p className="text-center text-muted-foreground">
                        Failed to load book details
                      </p>
                      <button
                        onClick={handleClose}
                        className="bg-title hover:bg-body rounded-lg px-6 py-2 text-background transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  ) : book ? (
                    <BookDetailContent
                      book={book}
                      fullBook={fullBook}
                      isLoadingNotes={isLoadingNotes}
                      contentRef={contentRef}
                      onShare={handleShare}
                      copied={copied}
                      bookId={bookId}
                      isModal={true}
                      onClose={handleClose}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-8">
                      <div className="flex flex-col items-center gap-3">
                        <Spinner className="size-8" />
                        <p className="text-sm text-muted-foreground">
                          Loading book details...
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
