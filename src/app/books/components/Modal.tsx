"use client";

import { useModalActions, useModalState } from "../contexts/BookPreviewContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { getBookPath, getBookShareUrl } from "~/lib/books/paths";
import { api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { BookDetailContent } from "./BookDetailContent";
import type { ModalPresentation } from "./ModalHost";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const style = getComputedStyle(element);
    return (
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  });
}

export function Modal({ presentation }: { presentation?: ModalPresentation }) {
  const { selectedBook, selectedBookId, isModalOpen } = useModalState();
  const { closeModal } = useModalActions();
  const [copied, setCopied] = useState(false);
  const isClosingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const fromStacks = presentation?.source === "stacks";

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

  // Canvas books have no DOM cover to receive focus, while books opened on
  // the dedicated site do. In either case the dialog itself becomes the
  // keyboard boundary immediately and gives focus back to a real trigger when
  // one exists. The content's own buttons remain the next Tab stops.
  useEffect(() => {
    if (!isModalOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => shellRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [isModalOpen]);

  // `aria-modal` describes a boundary; it does not create one. Keep both
  // sequential and programmatic focus inside the dialog while it is open.
  // The full-viewport backdrop already blocks pointer interaction, so this
  // local trap works identically on the standalone Books site and over the
  // Stacks world without making assumptions about either page's DOM root.
  useEffect(() => {
    if (!isModalOpen) return;

    const photoViewerOpen = () =>
      document.querySelector(".PhotoView-Portal") !== null;
    const containFocus = (event: FocusEvent) => {
      const shell = shellRef.current;
      if (!shell || photoViewerOpen()) return;
      if (event.target instanceof Node && shell.contains(event.target)) return;
      shell.focus({ preventScroll: true });
    };
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || photoViewerOpen()) return;
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = focusableChildren(shell);
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        shell.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && (active === shell || active === first)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("focusin", containFocus);
    window.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("keydown", trapTab);
    };
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
            transition={{
              duration: reduceMotion ? 0 : fromStacks ? 0.28 : 0.2,
            }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            onClick={handleClose}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                ref={shellRef}
                role="dialog"
                aria-modal="true"
                aria-label={
                  book?.title ? `${book.title} details` : "Book details"
                }
                tabIndex={-1}
                data-book-modal-shell={fromStacks ? "stacks" : undefined}
                className="relative w-full max-w-4xl outline-none"
                onClick={(e) => e.stopPropagation()}
                initial={
                  fromStacks && !reduceMotion
                    ? { opacity: 0, scale: 0.965, y: 14 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  fromStacks && !reduceMotion
                    ? { opacity: 0, scale: 0.982, y: 8 }
                    : { opacity: 0 }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : fromStacks
                      ? { duration: 0.34, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 0.2 }
                }
              >
                {/* Books can morph from their DOM cover via layoutId. A 3D
                    mesh has no DOM box to hand off from, so the homepage uses
                    the deliberate shell transition above instead of asking
                    Framer to morph from a source that does not exist. */}
                <motion.div
                  layoutId={fromStacks ? undefined : `book-cover-${bookId}`}
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
                  transition={{
                    duration: reduceMotion ? 0 : 0.15,
                    delay: reduceMotion ? 0 : 0.1,
                  }}
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
                      modalBreadcrumbHref={
                        fromStacks ? presentation.booksHref : undefined
                      }
                      modalBookHref={
                        fromStacks
                          ? `${presentation.booksHref}/${bookId}`
                          : undefined
                      }
                      modalBookCount={
                        fromStacks ? presentation.bookCount : undefined
                      }
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
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
