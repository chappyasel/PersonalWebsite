"use client";

import { useModalActions, useModalState } from "../contexts/BookPreviewContext";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBookPath, getBookShareUrl } from "~/lib/books/paths";
import type { Book } from "~/lib/books/types";

import { BOOK_MODAL_HISTORY_STATE } from "../components/modalHistory";

interface UseKeyboardNavigationOptions {
  books: Book[];
  isZoomOut: boolean;
}

export function useKeyboardNavigation({
  books,
  isZoomOut,
}: UseKeyboardNavigationOptions) {
  const { isModalOpen, keyboardFocusedIndex, keyboardFocusedBookId } =
    useModalState();
  const { setKeyboardFocus, clearKeyboardFocus, openModal, closeModal } =
    useModalActions();
  const searchParams = useSearchParams();

  // Track the last focused book ID to restore after modal close
  const lastFocusedBookIdRef = useRef<string | null>(null);

  // Track whether to show the visual focus indicator (only after keyboard use)
  const [showFocusIndicator, setShowFocusIndicator] = useState(false);

  // Track mouse movement to distinguish real hover from scroll-induced mouseenter
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseMovingRef = useRef(false);
  const mouseMovementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Global mouse move listener to detect actual mouse movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const lastPos = lastMousePosRef.current;
      // Consider it "moving" if position changed by more than 2px (accounts for sub-pixel rendering)
      if (
        lastPos &&
        (Math.abs(e.clientX - lastPos.x) > 2 ||
          Math.abs(e.clientY - lastPos.y) > 2)
      ) {
        isMouseMovingRef.current = true;

        // Reset the "moving" flag after a short delay of no movement
        if (mouseMovementTimeoutRef.current) {
          clearTimeout(mouseMovementTimeoutRef.current);
        }
        mouseMovementTimeoutRef.current = setTimeout(() => {
          isMouseMovingRef.current = false;
        }, 100);
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (mouseMovementTimeoutRef.current) {
        clearTimeout(mouseMovementTimeoutRef.current);
      }
    };
  }, []);

  // Hover handler - updates selection but hides indicator
  // Only responds to real mouse movement, not scroll-induced mouseenter
  const setHoveredBookId = useCallback(
    (bookId: string | null) => {
      // Ignore hover events that weren't caused by actual mouse movement
      if (!isMouseMovingRef.current) {
        return;
      }

      if (bookId) {
        const index = books.findIndex((b) => b.id === bookId);
        if (index !== -1) {
          setKeyboardFocus(index, bookId);
          setShowFocusIndicator(false); // Hide indicator on hover
        }
      }
    },
    [books, setKeyboardFocus],
  );

  // Track copy trigger for visual feedback (increments on each Cmd+C)
  const [copyTrigger, setCopyTrigger] = useState(0);

  // Find the book element that is visually above or below the current one
  // This handles cross-section navigation by using actual DOM positions
  const findVerticallyAdjacentBook = useCallback(
    (direction: "up" | "down"): { index: number; bookId: string } | null => {
      if (!keyboardFocusedBookId) return null;

      // Get current focused element
      const currentElement = document.querySelector(
        `[data-book-id="${keyboardFocusedBookId}"]`,
      );
      if (!currentElement || !(currentElement instanceof HTMLElement))
        return null;

      const currentRect = currentElement.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      // Get all book elements
      const allBookElements = document.querySelectorAll("[data-book-id]");

      let bestCandidate: {
        bookId: string;
        verticalDistance: number;
        horizontalDistance: number;
      } | null = null;

      allBookElements.forEach((element) => {
        const bookId = element.getAttribute("data-book-id");
        if (!bookId || bookId === keyboardFocusedBookId) return;

        const rect = element.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const centerX = rect.left + rect.width / 2;

        // Check direction: element must be meaningfully above/below
        // Use a threshold to account for elements in the same row
        const rowThreshold = currentRect.height * 0.5;

        const isAbove = centerY < currentCenterY - rowThreshold;
        const isBelow = centerY > currentCenterY + rowThreshold;

        if (direction === "up" && !isAbove) return;
        if (direction === "down" && !isBelow) return;

        const verticalDistance = Math.abs(centerY - currentCenterY);
        const horizontalDistance = Math.abs(centerX - currentCenterX);

        // Prefer candidates that are:
        // 1. In the same column (minimal horizontal distance)
        // 2. Closest vertically (immediate neighbor)
        if (!bestCandidate) {
          bestCandidate = { bookId, verticalDistance, horizontalDistance };
        } else {
          // Column alignment tolerance (60% of book width)
          const columnTolerance = currentRect.width * 0.6;

          const currentIsAligned =
            bestCandidate.horizontalDistance < columnTolerance;
          const candidateIsAligned = horizontalDistance < columnTolerance;

          // Prefer aligned candidates over non-aligned
          if (candidateIsAligned && !currentIsAligned) {
            bestCandidate = { bookId, verticalDistance, horizontalDistance };
          } else if (candidateIsAligned === currentIsAligned) {
            // Both aligned or both not aligned: prefer closer vertically
            // If same vertical distance, prefer closer horizontally
            if (
              verticalDistance < bestCandidate.verticalDistance ||
              (verticalDistance === bestCandidate.verticalDistance &&
                horizontalDistance < bestCandidate.horizontalDistance)
            ) {
              bestCandidate = { bookId, verticalDistance, horizontalDistance };
            }
          }
        }
      });

      if (!bestCandidate) return null;

      // Find the index in the books array
      // TypeScript needs explicit type narrowing after the null check
      const candidate: {
        bookId: string;
        verticalDistance: number;
        horizontalDistance: number;
      } = bestCandidate;
      const index = books.findIndex((b) => b.id === candidate.bookId);
      if (index === -1) return null;

      return { index, bookId: candidate.bookId };
    },
    [books, keyboardFocusedBookId],
  );

  // Navigate to a new index based on direction
  const navigate = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (books.length === 0) return;

      // Use current keyboard focus, or start from beginning
      const currentIndex = keyboardFocusedIndex ?? -1;

      let newIndex: number;
      let newBookId: string | undefined;

      // For vertical navigation, use DOM-based position querying
      // This properly handles navigation across section boundaries
      if (direction === "up" || direction === "down") {
        if (currentIndex === -1) {
          // No current focus: start at first book for down, last for up
          newIndex = direction === "down" ? 0 : books.length - 1;
          newBookId = books[newIndex]?.id;
        } else {
          const adjacent = findVerticallyAdjacentBook(direction);
          if (adjacent) {
            newIndex = adjacent.index;
            newBookId = adjacent.bookId;
          } else {
            // No adjacent book found, stay at current position
            return;
          }
        }
      } else {
        // Horizontal navigation: use flat index (left/right within visual order)
        if (direction === "left") {
          newIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        } else {
          newIndex =
            currentIndex >= books.length - 1
              ? books.length - 1
              : currentIndex + 1;
        }
        newBookId = books[newIndex]?.id;
      }

      if (newBookId) {
        setKeyboardFocus(newIndex, newBookId);
        setShowFocusIndicator(true); // Show indicator on keyboard navigation
        lastFocusedBookIdRef.current = newBookId;
      }
    },
    [books, keyboardFocusedIndex, findVerticallyAdjacentBook, setKeyboardFocus],
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
      window.history.pushState(
        BOOK_MODAL_HISTORY_STATE,
        "",
        getBookPath(book.id, searchParams.toString()),
      );
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
      const isInInput =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable;

      // Cmd+C or Ctrl+C to copy URL (works even in search bar)
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        // Only handle if nothing is selected
        if (!window.getSelection()?.toString()) {
          // Copy focused book URL, or first book if none focused
          const bookIdToCopy = keyboardFocusedBookId ?? books[0]?.id;
          if (bookIdToCopy) {
            e.preventDefault();
            const shareUrl = getBookShareUrl(bookIdToCopy);
            void navigator.clipboard.writeText(shareUrl);
            setCopyTrigger((prev) => prev + 1);
          }
        }
        return;
      }

      // Don't handle other keys if user is in input/textarea/select
      if (isInInput) {
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
    books,
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
