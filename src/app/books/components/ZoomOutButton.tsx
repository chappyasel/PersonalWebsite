"use client";

import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

type ZoomOutButtonProps = {
  totalBooks: number;
  isActive: boolean;
  onToggle: (width: number | null) => void;
};

// Constants for calculation
const MIN_BOOK_WIDTH = 50; // Minimum reasonable book width in px
const GRID_GAP = 8; // Gap between books in px
const HEADER_HEIGHT = 140; // Approximate header height in px
const CONTAINER_PADDING = 64; // Approximate container padding in px
const BOOK_ASPECT_RATIO = 2 / 3; // Book covers are 2:3 aspect ratio
const SECTION_HEADER_HEIGHT = 48; // Height of section headers
const BREAKPOINT_2XL = 1400; // Tailwind 2xl breakpoint in px

export function ZoomOutButton({
  totalBooks,
  isActive,
  onToggle,
}: ZoomOutButtonProps) {
  const [canFitAll, setCanFitAll] = useState(false);
  const [calculatedWidth, setCalculatedWidth] = useState<number | null>(null);

  const calculateFit = useCallback(() => {
    if (typeof window === "undefined" || totalBooks === 0) {
      setCanFitAll(false);
      return;
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Available space for books
    const availableWidth = windowWidth - CONTAINER_PADDING - 200; // 200 for sidebar
    const availableHeight =
      windowHeight - HEADER_HEIGHT - SECTION_HEADER_HEIGHT;

    // Try to find a book width that fits all books
    // Start from minimum width and check if all books fit
    let bookWidth = MIN_BOOK_WIDTH;
    const maxBookWidth = 100; // Don't go larger than this for "zoom out" mode

    // Binary search for optimal width
    while (bookWidth <= maxBookWidth) {
      const bookHeight = bookWidth / BOOK_ASPECT_RATIO;
      const booksPerRow = Math.floor(
        (availableWidth + GRID_GAP) / (bookWidth + GRID_GAP),
      );
      const rowsNeeded = Math.ceil(totalBooks / booksPerRow);
      const totalHeight = rowsNeeded * (bookHeight + GRID_GAP) - GRID_GAP;

      if (totalHeight <= availableHeight && booksPerRow >= 1) {
        // This width works! Try a larger width
        setCalculatedWidth(bookWidth);
        setCanFitAll(true);
        bookWidth += 5;
      } else {
        // This width doesn't fit, stop
        break;
      }
    }

    // If minimum width doesn't even fit, can't show the button
    if (calculatedWidth === null || calculatedWidth < MIN_BOOK_WIDTH) {
      const bookHeight = MIN_BOOK_WIDTH / BOOK_ASPECT_RATIO;
      const booksPerRow = Math.floor(
        (availableWidth + GRID_GAP) / (MIN_BOOK_WIDTH + GRID_GAP),
      );
      const rowsNeeded = Math.ceil(totalBooks / booksPerRow);
      const totalHeight = rowsNeeded * (bookHeight + GRID_GAP) - GRID_GAP;

      if (totalHeight <= availableHeight && booksPerRow >= 1) {
        setCalculatedWidth(MIN_BOOK_WIDTH);
        setCanFitAll(true);
      } else {
        setCanFitAll(false);
      }
    }
  }, [totalBooks, calculatedWidth]);

  useEffect(() => {
    calculateFit();

    const handleResize = () => {
      calculateFit();
      // If we're in zoom-out mode and window goes below 2xl breakpoint, deactivate
      if (isActive && window.innerWidth < BREAKPOINT_2XL) {
        onToggle(null);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateFit, isActive, onToggle]);

  // Don't render if we can't fit all books
  if (!canFitAll || totalBooks === 0) {
    return null;
  }

  const handleClick = () => {
    if (isActive) {
      onToggle(null);
    } else {
      onToggle(calculatedWidth);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            aria-label={
              isActive ? "Exit full bookshelf view" : "View entire bookshelf"
            }
            className="hidden size-10 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground 2xl:flex"
          >
            {isActive ? (
              <ArrowsInIcon className="size-4" weight="bold" />
            ) : (
              <ArrowsOutIcon className="size-4" weight="bold" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isActive ? "Exit full view" : "View entire bookshelf"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
