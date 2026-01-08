/* eslint-disable @next/next/no-img-element */
"use client";

import { PlayIcon } from "@phosphor-icons/react";
import {
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  CalendarIcon,
  LinkIcon,
  StarIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { getBookPath, getBooksPath } from "~/lib/books/paths";
import type { Book } from "~/lib/books/types";
import { cn } from "~/lib/util";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { TagBadge } from "./TagBadge";

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

/* eslint-disable @next/next/no-img-element */

// Animation configuration - overdamped to prevent oscillation
const SPRING_CONFIG = {
  type: "spring" as const,
  stiffness: 200,
  damping: 50,
};

/**
 * Process details/summary blocks to ensure markdown inside is rendered
 * Converts <details><summary>X</summary>Y</details> format to a structure
 * where the content is properly processed as markdown
 */
function processDetailsBlocks(markdown: string): string {
  // Match details blocks with their content
  const detailsRegex = /<details>(.*?)<\/details>/gs;

  return markdown.replace(detailsRegex, (match: string, content: string) => {
    // Extract summary and remaining content
    const summaryRegex = /<summary>(.*?)<\/summary>(.*)/s;
    const summaryMatch = summaryRegex.exec(content);

    if (!summaryMatch) {
      return match; // Return original if format is unexpected
    }

    const summaryText = summaryMatch[1]?.trim() ?? "";
    const detailsContent = summaryMatch[2]?.trim() ?? "";

    // Return formatted with newlines so markdown inside gets processed
    return `\n<details>\n<summary>${summaryText}</summary>\n\n${detailsContent}\n\n</details>\n`;
  });
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? "th";
}

/**
 * Format read dates into a unified display string
 * Same month: "March 12th - 18th '25" (full month name, always spaces)
 * Different months: "Mar 12th - Apr 3rd '25" (short month names)
 */
function formatReadDates(
  started: string | null,
  finished: string | null,
): string | null {
  if (!started || !finished) return null;

  const startDate = new Date(started);
  const endDate = new Date(finished);

  const startMonthShort = startDate.toLocaleDateString("en-US", {
    month: "short",
  });
  const endMonthShort = endDate.toLocaleDateString("en-US", { month: "short" });
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const year = endDate.toLocaleDateString("en-US", { year: "2-digit" });

  if (startMonthShort === endMonthShort) {
    // Same month: use full month name "March 12th - 18th '25"
    const fullMonth = startDate.toLocaleDateString("en-US", { month: "long" });
    return `${fullMonth} ${startDay}${getOrdinalSuffix(startDay)} - ${endDay}${getOrdinalSuffix(endDay)} '${year}`;
  } else {
    // Different months: use short names "Mar 12th - Apr 3rd '25"
    return `${startMonthShort} ${startDay}${getOrdinalSuffix(startDay)} - ${endMonthShort} ${endDay}${getOrdinalSuffix(endDay)} '${year}`;
  }
}

/**
 * Calculate reading duration in days
 */
function getReadingDays(
  started: string | null,
  finished: string | null,
): number | null {
  if (!started || !finished) return null;

  const startDate = new Date(started);
  const endDate = new Date(finished);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

type BookDetailContentProps = {
  book: Book & { notes?: string };
  fullBook?: Book & { notes?: string };
  isLoadingNotes: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  onShare: () => void;
  copied: boolean;
  bookId: string;
  isModal?: boolean;
  onClose?: () => void;
};

export function BookDetailContent({
  book,
  fullBook,
  isLoadingNotes,
  contentRef,
  onShare,
  copied,
  bookId,
  isModal = false,
  onClose,
}: BookDetailContentProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const posthog = usePostHog();
  const hasTrackedView = useRef(false);

  // Track book view on mount (only once per component instance)
  useEffect(() => {
    if (!hasTrackedView.current) {
      posthog.capture("book_viewed", {
        book_id: book.id,
        book_title: book.title,
        author: book.author,
        rating: book.rating,
        tags: book.tags,
      });
      hasTrackedView.current = true;
    }
  }, [posthog, book.id, book.title, book.author, book.rating, book.tags]);

  const handleNotionClick = () => {
    posthog.capture("book_notion_opened", {
      book_id: book.id,
      book_title: book.title,
    });
  };

  const handleShare = () => {
    posthog.capture("book_link_copied", {
      book_id: book.id,
      book_title: book.title,
    });
    onShare();
  };

  // Scroll-driven animation setup
  const scrollProgress = useMotionValue(0);
  const smoothProgress = useSpring(scrollProgress, SPRING_CONFIG);

  // Responsive breakpoint detection
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    setIsLargeScreen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Cover sizing
  const coverHeight = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["300px", "55px"] : ["220px", "42px"],
  );
  const coverBorderRadius = useTransform(
    smoothProgress,
    [0, 1],
    ["12px", "4px"],
  );
  const coverBoxShadow = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen
      ? ["0px 8px 20px rgba(0, 0, 0, 0.15)", "0px 2px 6px rgba(0, 0, 0, 0.1)"]
      : ["0px 4px 6px rgba(0, 0, 0, 0.1)", "0px 1px 3px rgba(0, 0, 0, 0.08)"],
  );

  // Header padding
  const headerPadding = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["40px", "16px"] : ["24px", "16px"],
  );

  // Text sizing
  const titleFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["36px", "28px"] : ["24px", "18px"],
  );
  const authorFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["20px", "16px"] : ["16px", "14px"],
  );
  const headerGap = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["28px", "12px"] : ["16px", "12px"],
  );
  const titleAuthorGap = useTransform(smoothProgress, [0, 1], ["2px", "0px"]);
  const titleLineClamp = useTransform(smoothProgress, [0.4, 0.7], [2, 1]);

  // Compact header text opacity - mobile only, fades in as user scrolls
  const compactHeaderOpacity = useTransform(
    smoothProgress,
    [0.1, 0.8],
    isLargeScreen ? [0, 0] : [0, 1],
  );

  // Full metadata section opacity - mobile only, fades out as user scrolls
  const fullMetadataOpacity = useTransform(
    smoothProgress,
    [0.1, 0.8],
    isLargeScreen ? [0, 0] : [1, 0],
  );

  // Progressive metadata collapse - opacity fades for each section (desktop only)
  const ratingOpacity = useTransform(
    smoothProgress,
    [0.6, 0.8],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const datesOpacity = useTransform(
    smoothProgress,
    [0.4, 0.6],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const tagsOpacity = useTransform(
    smoothProgress,
    [0.2, 0.4],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const actionsOpacity = useTransform(
    smoothProgress,
    [0, 0.2],
    isLargeScreen ? [1, 0] : [1, 1],
  );

  const borderOpacity = useTransform(
    smoothProgress,
    [0.1, 0.3],
    ["rgba(115, 115, 115, 0)", "rgba(115, 115, 115, 0.1)"],
  );

  // Track scroll for sticky headers
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef?.current) {
        const progress = Math.min(contentRef.current.scrollTop / 100, 1);
        scrollProgress.set(progress);
      }
    };

    const contentEl = contentRef?.current;
    if (contentEl) {
      contentEl.addEventListener("scroll", handleScroll);
      return () => contentEl.removeEventListener("scroll", handleScroll);
    }
  }, [contentRef, scrollProgress]);

  return (
    <div
      ref={contentRef}
      className={`relative h-full overflow-y-auto overflow-x-hidden`}
    >
      {/* Unified Sticky Header */}
      <motion.div
        className={cn(
          "sticky top-0 z-20 bg-background/80 backdrop-blur-md",
          isModal && "dark:bg-muted/80",
        )}
        style={{
          paddingTop: headerPadding,
          paddingBottom: "16px",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: borderOpacity,
        }}
      >
        {/* Container for content with max-w-3xl */}
        <div className="relative mx-auto w-full max-w-3xl">
          {/* Action buttons - expand (modal only) and close */}
          <div className="absolute right-6 top-0.5 z-10 flex items-center gap-2 xs:right-14 sm:top-2 lg:top-[10px]">
            {isModal && (
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    {/* Use <a> instead of Link to force hard navigation out of intercepted route */}
                    <a
                      href={getBookPath(bookId)}
                      className="flex size-10 items-center justify-center rounded-full bg-muted shadow-sm backdrop-blur-sm transition-all duration-200 ease-in-out hover:bg-primary/20"
                      aria-label="Open full page"
                    >
                      <ArrowsOutSimpleIcon
                        size={20}
                        weight="bold"
                        className="text-primary"
                      />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Open full page</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  {isModal && onClose ? (
                    <button
                      onClick={onClose}
                      className="flex size-10 items-center justify-center rounded-full bg-muted shadow-sm backdrop-blur-sm transition-all duration-200 ease-in-out hover:bg-primary/20"
                      aria-label="Close"
                    >
                      <XIcon size={20} weight="bold" className="text-primary" />
                    </button>
                  ) : (
                    <Link
                      href={getBooksPath()}
                      className="flex size-10 items-center justify-center rounded-full bg-muted shadow-sm backdrop-blur-sm transition-all duration-200 ease-in-out hover:bg-primary/20"
                      aria-label="Return to all book notes"
                    >
                      <XIcon size={20} weight="bold" className="text-primary" />
                    </Link>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isModal ? "Close" : "Return to all book notes"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Main Row: Cover + Title/Author (Compact) */}
          <motion.div
            className="flex w-full flex-row items-start px-6 xs:px-14"
            style={{ gap: headerGap }}
          >
            {/* Cover Image */}
            <motion.div
              className="aspect-[2/3] flex-shrink-0"
              style={{ height: coverHeight }}
            >
              {coverUrl ? (
                <motion.div
                  style={{
                    borderRadius: coverBorderRadius,
                    boxShadow: coverBoxShadow,
                  }}
                  className="h-full w-full overflow-hidden"
                >
                  <Image
                    src={coverUrl}
                    alt={`${book.title} cover`}
                    className="h-full w-full object-cover"
                    width={1000}
                    height={1500}
                    priority
                  />
                </motion.div>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted p-2 text-center shadow-md">
                  <p className="text-xs font-bold text-foreground">
                    {book.title}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Compact Title/Author - Desktop shows animated version, Mobile fades in */}
            {isLargeScreen ? (
              /* Desktop: Animated title/author with metadata */
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                className="relative min-w-0 flex-1 overflow-visible pr-12"
              >
                <div className="relative">
                  <motion.h2
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: titleFontSize,
                      marginBottom: titleAuthorGap,
                      display: "-webkit-box",
                      WebkitLineClamp: titleLineClamp,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    className={cn(
                      "font-bold leading-[1.125] text-foreground",
                      isModal && "mr-12",
                    )}
                  >
                    {book.title}
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: authorFontSize,
                    }}
                    className="line-clamp-1 text-muted-foreground"
                  >
                    {book.author}
                  </motion.p>

                  {/* Metadata - Desktop only */}
                  <motion.div
                    className="absolute left-0 top-full pt-2"
                    style={{
                      width: "calc(min(100vw, 768px) - 80px - 194px - 70px)",
                    }}
                  >
                    {book.rating && (
                      <motion.div
                        className="mt-3 flex gap-1"
                        style={{ opacity: ratingOpacity }}
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <StarIcon
                            key={i}
                            size={20}
                            weight={i < book.rating! ? "fill" : "duotone"}
                            className={
                              i < book.rating!
                                ? "text-yellow-400"
                                : "text-body/20 opacity-50"
                            }
                          />
                        ))}
                      </motion.div>
                    )}

                    <motion.div
                      className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground"
                      style={{ opacity: datesOpacity }}
                    >
                      {book.publicationYear && (
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-1 font-medium">
                            <CalendarIcon size={12} weight="bold" />
                            <span>Published:</span>
                          </div>
                          <span className="font-bold">
                            {book.publicationYear}
                          </span>
                        </div>
                      )}
                      {book.started && book.finished ? (
                        <TooltipProvider>
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <div className="flex cursor-default items-center gap-1">
                                <div className="flex items-center gap-1 font-medium">
                                  <CalendarIcon size={12} weight="bold" />
                                  <span>Read:</span>
                                </div>
                                <span className="font-bold">
                                  {formatReadDates(book.started, book.finished)}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {getReadingDays(book.started, book.finished)}{" "}
                                days
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : book.started ? (
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-1 font-medium">
                            <CalendarIcon size={12} weight="bold" />
                            <span>Started:</span>
                          </div>
                          <span className="font-bold">
                            {(() => {
                              const d = new Date(book.started);
                              const month = d.toLocaleDateString("en-US", {
                                month: "long",
                              });
                              const day = d.getDate();
                              const year = d.toLocaleDateString("en-US", {
                                year: "2-digit",
                              });
                              return `${month} ${day}${getOrdinalSuffix(day)} '${year}`;
                            })()}
                          </span>
                        </div>
                      ) : null}
                    </motion.div>

                    {book.tags.length > 0 && (
                      <motion.div
                        className="mt-3 flex flex-wrap gap-2"
                        style={{ opacity: tagsOpacity }}
                      >
                        {book.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </motion.div>
                    )}

                    <motion.div
                      className="-ml-3 mt-2 flex flex-wrap items-center gap-0"
                      style={{ opacity: actionsOpacity }}
                    >
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={book.notionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleNotionClick}
                        >
                          <ArrowSquareOutIcon size={12} weight="bold" />
                          View in Notion
                        </a>
                      </Button>

                      <Button variant="ghost" size="sm" onClick={handleShare}>
                        <LinkIcon size={12} weight="bold" />
                        {copied ? "Copied!" : "Copy link"}
                      </Button>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              /* Mobile: Simple compact title/author that fades in */
              <motion.div
                className="flex min-w-0 flex-1 flex-col gap-0 pr-24"
                style={{ opacity: compactHeaderOpacity }}
              >
                <motion.h2
                  style={{ fontSize: titleFontSize }}
                  className="line-clamp-1 font-bold leading-tight text-foreground"
                >
                  {book.title}
                </motion.h2>
                <motion.p
                  style={{ fontSize: authorFontSize }}
                  className="line-clamp-1 text-muted-foreground"
                >
                  {book.author}
                </motion.p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Full Metadata Section - Mobile Only (fades out as user scrolls) */}
      {!isLargeScreen && (
        <motion.div
          style={{ opacity: fullMetadataOpacity }}
          className="mx-auto w-full max-w-3xl px-6 pb-6 pt-2 xs:px-14"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              {/* Title */}
              <h2 className="text-2xl font-bold leading-tight text-foreground">
                {book.title}
              </h2>

              {/* Author */}
              <p className="text-base text-muted-foreground">{book.author}</p>
            </div>
            {/* Rating */}
            {book.rating && (
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon
                    key={i}
                    size={20}
                    weight={i < book.rating! ? "fill" : "duotone"}
                    className={
                      i < book.rating!
                        ? "text-yellow-400"
                        : "text-body/20 opacity-50"
                    }
                  />
                ))}
              </div>
            )}

            {/* Dates */}
            {(book.publicationYear ?? book.started ?? book.finished) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {book.publicationYear && (
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 font-medium">
                      <CalendarIcon size={12} weight="bold" />
                      <span>Published:</span>
                    </div>
                    <span className="font-bold">{book.publicationYear}</span>
                  </div>
                )}
                {book.started && book.finished ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <div className="flex cursor-default items-center gap-1">
                          <div className="flex items-center gap-1 font-medium">
                            <CalendarIcon size={12} weight="bold" />
                            <span>Read:</span>
                          </div>
                          <span className="font-bold">
                            {formatReadDates(book.started, book.finished)}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {getReadingDays(book.started, book.finished)} days
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : book.started ? (
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 font-medium">
                      <CalendarIcon size={12} weight="bold" />
                      <span>Started:</span>
                    </div>
                    <span className="font-bold">
                      {(() => {
                        const d = new Date(book.started);
                        const month = d.toLocaleDateString("en-US", {
                          month: "long",
                        });
                        const day = d.getDate();
                        const year = d.toLocaleDateString("en-US", {
                          year: "2-digit",
                        });
                        return `${month} ${day}${getOrdinalSuffix(day)} '${year}`;
                      })()}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Tags */}
            {book.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {book.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex -translate-x-3 flex-wrap gap-0">
              <Button variant="ghost" size="sm" asChild>
                <a
                  href={book.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleNotionClick}
                >
                  <ArrowSquareOutIcon size={12} weight="bold" />
                  View in Notion
                </a>
              </Button>

              <Button variant="ghost" size="sm" onClick={handleShare}>
                <LinkIcon size={12} weight="bold" />
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main content */}
      <div
        className={cn(
          "mx-auto w-full max-w-3xl px-6 pt-0 xs:px-14 md:pt-6",
          !book.hasNotes && "lg:pb-0",
        )}
      >
        {/* Notes section */}
        {book.hasNotes ? (
          <div className="pb-[min(25vh,300px)]">
            {isLoadingNotes ? (
              <div className="flex min-h-[50vh] items-center justify-center py-8">
                <div className="flex flex-col items-center gap-3">
                  <Spinner className="size-6" />
                  <p className="text-sm text-muted-foreground">
                    Loading book details...
                  </p>
                </div>
              </div>
            ) : fullBook?.notes ? (
              <div
                className={cn(
                  "prose prose-sm prose-neutral max-w-none leading-[1.75] text-foreground",
                  "prose-headings:mb-0 prose-headings:font-bold prose-headings:text-foreground prose-h1:translate-y-3 prose-h1:py-3 prose-h1:text-2xl prose-h2:translate-y-[-8px] prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-xs",
                  "prose-p:translate-y-2 prose-p:text-foreground prose-a:text-foreground prose-a:underline hover:prose-a:text-foreground prose-strong:font-bold prose-strong:text-foreground",
                  "prose-ol:my-0 prose-ol:list-decimal prose-ul:my-0 prose-ul:list-disc prose-li:my-px prose-li:text-foreground",
                  "prose-blockquote:border-l-0",
                  "prose-img:max-h-[600px] prose-img:max-w-[400px] prose-img:rounded-lg prose-img:shadow-md",
                )}
              >
                <PhotoProvider>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    urlTransform={(url) => {
                      // Allow data URLs (base64 images from Notion)
                      if (url.startsWith("data:")) {
                        return url;
                      }
                      // Allow Notion S3 image URLs
                      if (url.includes("prod-files-secure.s3")) {
                        return url;
                      }
                      // Use default transform for security on other URLs
                      return defaultUrlTransform(url);
                    }}
                    components={
                      {
                        img: ({ src, alt, ...props }) => {
                          if (!src) return null;
                          return (
                            <PhotoView src={src as string}>
                              <img
                                src={src}
                                alt={alt ?? ""}
                                className="cursor-zoom-in"
                                {...props}
                              />
                            </PhotoView>
                          );
                        },
                        details: ({ children, ...props }) => (
                          <details
                            {...props}
                            className="group my-1.5 pl-[26px]"
                          >
                            {children}
                          </details>
                        ),
                        summary: ({ children, ...props }) => {
                          // Process inline markdown (bold/italic) in summary text
                          const processInlineMarkdown = (
                            node: React.ReactNode,
                          ): React.ReactNode => {
                            if (typeof node === "string") {
                              const parts = node.split(
                                /(\*\*[^*]+\*\*|\*[^*]+\*)/g,
                              );
                              return parts.map((part, i) => {
                                if (
                                  part.startsWith("**") &&
                                  part.endsWith("**")
                                ) {
                                  return (
                                    <strong key={i}>{part.slice(2, -2)}</strong>
                                  );
                                }
                                if (
                                  part.startsWith("*") &&
                                  part.endsWith("*")
                                ) {
                                  return <em key={i}>{part.slice(1, -1)}</em>;
                                }
                                return part;
                              });
                            }
                            if (Array.isArray(node)) {
                              return node.map((child: React.ReactNode, i) => (
                                <span key={i}>
                                  {processInlineMarkdown(child)}
                                </span>
                              ));
                            }
                            return node;
                          };

                          return (
                            <summary
                              {...props}
                              className="-ml-5 flex cursor-pointer list-none items-center gap-2.5 text-foreground [&::-webkit-details-marker]:hidden"
                            >
                              <PlayIcon
                                size={12}
                                weight="fill"
                                className="shrink-0 transition-transform duration-200 group-open:rotate-90"
                              />
                              {processInlineMarkdown(children)}
                            </summary>
                          );
                        },
                      } as Components
                    }
                  >
                    {processDetailsBlocks(fullBook.notes)}
                  </ReactMarkdown>
                </PhotoProvider>
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground/70">
                This book has notes. View them in{" "}
                <a
                  href={book.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline hover:text-muted-foreground"
                >
                  Notion
                </a>
                .
              </p>
            )}
          </div>
        ) : !isModal ? (
          <div className="border-t border-muted-foreground/10 pt-8 lg:pt-10">
            <p className="py-8 text-center text-sm text-muted-foreground/70">
              No notes for this book.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
