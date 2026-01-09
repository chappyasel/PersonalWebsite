"use client";

import { useSearchParams } from "next/navigation";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { getBookPath, getBookShareUrl } from "~/lib/books/paths";
import type { Book } from "~/lib/books/types";

import {
  useModalActions,
  useModalState,
} from "../contexts/BookPreviewContext";

interface UseKeyboardNavigationOptions {
  books: Book[];
  gridContainerRef: RefObject<HTMLDivElement | null>;
  isZoomOut: boolean;
  onScrollToIndex?: (index: number) => void;
}

export function useKeyboardNavigation({
  books,
  gridContainerRef,
  isZoomOut,
  onScrollToIndex,
}: UseKeyboardNavigationOptions) {
  const { isModalOpen, keyboardFocusedIndex, keyboardFocusedBookId } =
    useModalState();
  const { setKeyboardFocus, clearKeyboardFocus, openModal, closeModal } = useModalActions();
  const searchParams = useSearchParams();

  // Track the last focused book ID to restore after modal close
  const lastFocusedBookIdRef = useRef<string | null>(null);

  // Track whether to show the visual focus indicator (only after keyboard use)
  const [showFocusIndicator, setShowFocusIndicator] = useState(false);

  // Hover handler - updates selection but hides indicator
  const setHoveredBookId = useCallback((bookId: string | null) => {
    if (bookId) {
      const index = books.findIndex((b) => b.id === bookId);
      if (index !== -1) {
        setKeyboardFocus(index, bookId);
        setShowFocusIndicator(false); // Hide indicator on hover
      }
    }
  }, [books, setKeyboardFocus]);

  // Track copy trigger for visual feedback (increments on each Cmd+C)
  const [copyTrigger, setCopyTrigger] = useState(0);

  // Calculate the number of columns in the grid based on container width
  const computeColumnCount = useCallback(() => {
    const container = gridContainerRef.current;
    if (!container) return 1;

    // The container ref IS on the grid element, so use it directly
    const style = getComputedStyle(container);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    return Math.max(1, columns);
  }, [gridContainerRef]);

  // Navigate to a new index based on direction
  const navigate = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (books.length === 0) return;

      const columnCount = computeColumnCount();

      // Use current keyboard focus, or start from beginning
      const currentIndex = keyboardFocusedIndex ?? -1;

      let newIndex: number;

      switch (direction) {
        case "left":
          newIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
          break;
        case "right":
          newIndex =
            currentIndex >= books.length - 1
              ? books.length - 1
              : currentIndex + 1;
          break;
        case "up":
          if (currentIndex === -1) {
            newIndex = 0;
          } else if (currentIndex < columnCount) {
            newIndex = currentIndex;
          } else {
            newIndex = currentIndex - columnCount;
          }
          break;
        case "down":
          if (currentIndex === -1) {
            newIndex = 0;
          } else {
            newIndex = Math.min(books.length - 1, currentIndex + columnCount);
          }
          break;
      }

      const book = books[newIndex];
      if (book) {
        setKeyboardFocus(newIndex, book.id);
        setShowFocusIndicator(true); // Show indicator on keyboard navigation
        lastFocusedBookIdRef.current = book.id;
        onScrollToIndex?.(newIndex);
      }
    },
    [
      books,
      keyboardFocusedIndex,
      computeColumnCount,
      setKeyboardFocus,
      onScrollToIndex,
    ],
  );

  // Open the focused book or the first book
  const openFocusedBook = useCallback(() => {
    if (books.length === 0) return;

    // Use current keyboard focus, or first book
    const indexToOpen =
      keyboardFocusedIndex !== null && keyboardFocusedIndex >= 0
        ? keyboardFocusedIndex
        : 0;

    const book = books[indexToOpen];

    if (book) {
      // Set focus if not already set
      if (keyboardFocusedIndex === null) {
        setKeyboardFocus(indexToOpen, book.id);
        setShowFocusIndicator(true); // Show indicator on keyboard action
        lastFocusedBookIdRef.current = book.id;
      }
      // Open the modal
      openModal(book, "M");
      // Update URL without navigation (preserve query params)
      window.history.pushState(null, "", getBookPath(book.id, searchParams.toString()));
    }
  }, [books, keyboardFocusedIndex, setKeyboardFocus, openModal, searchParams]);

  // Copy the focused book's URL and trigger visual feedback
  const copyFocusedBookUrl = useCallback(() => {
    if (keyboardFocusedBookId) {
      const shareUrl = getBookShareUrl(keyboardFocusedBookId);
      void navigator.clipboard.writeText(shareUrl);
      setCopyTrigger((prev) => prev + 1);
    }
  }, [keyboardFocusedBookId]);

  // Clear focus when books array changes (e.g., filters applied)
  useEffect(() => {
    clearKeyboardFocus();
  }, [books.length, clearKeyboardFocus]);

  // Restore focus after modal closes
  useEffect(() => {
    if (!isModalOpen && lastFocusedBookIdRef.current) {
      const index = books.findIndex(
        (b) => b.id === lastFocusedBookIdRef.current,
      );
      if (index !== -1) {
        setKeyboardFocus(index, lastFocusedBookIdRef.current);
      }
    }
  }, [isModalOpen, books, setKeyboardFocus]);

  // Global keyboard event handler
  useEffect(() => {
    // Disable keyboard navigation in zoom-out mode or when no books
    if (isZoomOut || books.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();

      // Don't handle if user is in input/textarea/select
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      // Spacebar to toggle modal (works when modal is open or closed)
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (isModalOpen) {
          closeModal();
          window.history.back();
        } else {
          openFocusedBook();
        }
        return;
      }

      // The rest only applies when modal is NOT open
      if (isModalOpen) return;

      // Arrow key navigation
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigate("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        navigate("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate("right");
      }
      // Enter to open book
      else if (e.key === "Enter") {
        e.preventDefault();
        openFocusedBook();
      }
      // Cmd+C or Ctrl+C to copy URL
      else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        // Only handle if there's a keyboard-focused book and nothing is selected
        if (keyboardFocusedBookId && !window.getSelection()?.toString()) {
          e.preventDefault();
          copyFocusedBookUrl();
        }
      }
      // Escape to clear selection
      else if (e.key === "Escape" && keyboardFocusedBookId) {
        e.preventDefault();
        clearKeyboardFocus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isZoomOut,
    isModalOpen,
    books.length,
    navigate,
    openFocusedBook,
    closeModal,
    copyFocusedBookUrl,
    keyboardFocusedBookId,
    clearKeyboardFocus,
  ]);

  return {
    focusedIndex: keyboardFocusedIndex,
    focusedBookId: keyboardFocusedBookId,
    showFocusIndicator,
    copyTrigger,
    setHoveredBookId,
  };
}
