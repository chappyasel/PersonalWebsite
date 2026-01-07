"use client";

import { BookDetailContent } from "../../components/BookDetailContent";
import { useBookPreview } from "../../contexts/BookPreviewContext";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getBookShareUrl } from "~/lib/books/paths";
import { useSubdomain } from "~/lib/books/subdomainContext";
import { api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

type ModalProps = {
  bookId: string;
};

export function Modal({ bookId }: ModalProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const { selectedBook } = useBookPreview();
  const { isSubdomain } = useSubdomain();

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
  const isLoadingNotes = isLoadingFull && !fullBook;

  const handleClose = () => {
    setIsOpen(false);
  };

  // Prevent background scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Handle share button click
  const handleShare = async () => {
    const shareUrl = getBookShareUrl(bookId, isSubdomain);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <AnimatePresence onExitComplete={() => router.back()}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-stone-500/20 backdrop-blur-sm"
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
              <motion.div
                className="relative w-full max-w-3xl"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  type: "spring",
                  damping: 25,
                  stiffness: 300,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={`relative overflow-hidden rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] ${book?.hasNotes ? "h-[max(85vh,min(1000px,calc(100vh-32px)))]" : "max-h-[85vh]"}`}
                >
                  {/* Close button */}
                  <button
                    onClick={handleClose}
                    className="absolute right-4 top-4 z-30 rounded-full bg-background/80 p-2 backdrop-blur-sm transition-all hover:bg-accent md:right-6 md:top-6"
                    aria-label="Close modal"
                  >
                    <XIcon
                      size={20}
                      weight="bold"
                      className="text-foreground"
                    />
                  </button>

                  {/* Content */}
                  {error ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                      <p className="text-center text-muted-foreground">
                        Failed to load book details
                      </p>
                      <button
                        onClick={handleClose}
                        className="rounded-lg bg-title px-6 py-2 text-background transition-colors hover:bg-body"
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
                </div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
