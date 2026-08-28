"use client";

import { useModalActions, useModalState } from "../contexts/BookPreviewContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  takeSheetOrigin,
  type SheetOrigin,
} from "~/components/daylight/sheetOrigin";

import { getBookPath, getBookShareUrl } from "~/lib/books/paths";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { BookDetailContent } from "./BookDetailContent";
import type { ModalPresentation } from "./ModalHost";
import { shouldUseModalEnterShortcut } from "./modalKeyboard";

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
  const backdropRef = useRef<HTMLDivElement>(null);
  // A 3D cover/spine click records a small rect at the pointer (a mesh has
  // no DOM box); the shell flies from and back to it, the same origin pop
  // the daylight sheet does. Absent on the standalone books site, where the
  // cover's layoutId morph already owns the entrance.
  const stacksOriginRef = useRef<SheetOrigin | null>(null);
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
    // Stacks origin pop, reversed: the shell flies back to the clicked
    // cover's rect before the modal state tears down.
    const origin = stacksOriginRef.current;
    const shell = shellRef.current;
    if (origin && shell && !reduceMotion) {
      stacksOriginRef.current = null;
      const final = shell.getBoundingClientRect();
      const scale = Math.max(origin.w / final.width, 0.08);
      const dx = origin.l + origin.w / 2 - (final.left + final.width / 2);
      const dy = origin.t + origin.h / 2 - (final.top + final.height / 2);
      backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 300,
        easing: "ease",
        fill: "forwards",
      });
      const flight = shell.animate(
        [
          { transform: "none", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
            opacity: 0.2,
          },
        ],
        {
          duration: 340,
          easing: "cubic-bezier(0.7, 0, 0.84, 0)",
          fill: "forwards",
        },
      );
      flight.onfinish = () => {
        closeModal();
        window.history.back();
      };
      return;
    }
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

  // Stacks origin pop: overlay a WAAPI flight from the clicked cover's rect
  // on top of the shell transition (WAAPI owns transform/opacity while it
  // runs, and both land on identity, so the two never fight). Before paint,
  // so the shell never flashes at rest first.
  useLayoutEffect(() => {
    if (!isModalOpen || !fromStacks) return;
    const origin = takeSheetOrigin();
    if (!origin) return;
    stacksOriginRef.current = origin;
    const shell = shellRef.current;
    if (!shell || reduceMotion) return;
    const final = shell.getBoundingClientRect();
    if (final.width === 0) return;
    const scale = Math.max(origin.w / final.width, 0.08);
    const dx = origin.l + origin.w / 2 - (final.left + final.width / 2);
    const dy = origin.t + origin.h / 2 - (final.top + final.height / 2);
    shell.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          opacity: 0.3,
        },
        { transform: "none", opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, fromStacks]);

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
      if (isUniversalSearchOpen()) return;
      const shell = shellRef.current;
      if (!shell || photoViewerOpen()) return;
      if (event.target instanceof Node && shell.contains(event.target)) return;
      shell.focus({ preventScroll: true });
    };
    const trapTab = (event: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
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
      if (isUniversalSearchOpen()) return;
      // Check if photo viewer is open (react-photo-view adds this class to body)
      const photoViewOpen = document.querySelector(".PhotoView-Portal");

      if (e.key === "Escape" && !photoViewOpen) {
        handleClose();
      } else if (shouldUseModalEnterShortcut(e) && !photoViewOpen && bookId) {
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
            ref={backdropRef}
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
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
            onClick={handleClose}
          >
            <div className="flex h-[100dvh] min-h-[320px] items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
              <motion.div
                ref={shellRef}
                role="dialog"
                aria-modal="true"
                aria-label={
                  book?.title ? `${book.title} details` : "Book details"
                }
                tabIndex={-1}
                data-book-modal-shell={fromStacks ? "stacks" : undefined}
                className={`relative w-full max-w-4xl outline-none ${book?.hasNotes ? "h-full max-h-[max(85dvh,1000px)]" : ""}`}
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
                  className={`absolute inset-0 rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:bg-muted ${book?.hasNotes ? "h-full" : "max-h-[85dvh]"}`}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                />
                {/* Actual content - fades in on top */}
                <motion.div
                  className={`relative overflow-hidden rounded-2xl bg-background dark:bg-muted ${book?.hasNotes ? "h-full" : "max-h-[85dvh]"}`}
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
