"use client";

import {
  ArrowSquareOutIcon,
  LinkIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import Image from "next/image";
import { type RefObject, useEffect, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";
import { cn } from "~/lib/util";

import { Button } from "~/components/ui/button";

import { TagBadge } from "./TagBadge";

// Animation configuration - overdamped to prevent oscillation
const SPRING_CONFIG = {
  type: "spring" as const,
  stiffness: 200,
  damping: 50,
};

type BookDetailContentProps = {
  book: Book & { notes?: string };
  fullBook?: Book & { notes?: string };
  isLoadingNotes: boolean;
  contentRef?: RefObject<HTMLDivElement>;
  onShare: () => void;
  copied: boolean;
  bookId: string;
  isModal?: boolean;
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
}: BookDetailContentProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);

  // Scroll-driven animation setup
  const scrollProgress = useMotionValue(0);
  const smoothProgress = useSpring(scrollProgress, SPRING_CONFIG);

  // Responsive breakpoint detection
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    setIsLargeScreen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Cover sizing
  const coverWidth = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["154px", "43.2px"] : ["115.2px", "38.4px"],
  );
  const coverHeight = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["230.4px", "62.4px"] : ["153.6px", "57.6px"],
  );

  // Header padding
  const headerPadding = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["24px", "16px"] : ["16px", "16px"],
  );

  // Text sizing
  const titleFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["36px", "24px"] : ["24px", "24px"],
  );
  const authorFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["20px", "16px"] : ["16px", "16px"],
  );
  const headerGap = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["24px", "12px"] : ["24px", "12px"],
  );
  const titleAuthorGap = useTransform(smoothProgress, [0, 1], ["0px", "2px"]);

  // Progressive metadata collapse - opacity fades for each section
  const ratingOpacity = useTransform(smoothProgress, [0.6, 0.8], [1, 0]);
  const datesOpacity = useTransform(smoothProgress, [0.4, 0.6], [1, 0]);
  const tagsOpacity = useTransform(smoothProgress, [0.2, 0.4], [1, 0]);
  const actionsOpacity = useTransform(smoothProgress, [0, 0.2], [1, 0]);

  // Metadata positioning
  const metadataTop = useTransform(
    smoothProgress,
    [0, 0.5],
    isLargeScreen ? ["70px", "60px"] : ["60px", "35px"],
  );

  // Fixed metadata width based on initial state (progress 0)
  // Container width (max-w-3xl = 768px) - padding (lg:px-10 = 80px, px-6 = 48px) - initial cover width - initial gap
  const metadataWidth = isLargeScreen
    ? "calc(min(100vw, 768px) - 80px - 154px - 24px)"
    : "calc(100vw - 48px - 115.2px - 24px)";

  const borderOpacity = useTransform(smoothProgress, [0.8, 1], [0, 0.1]);
  const headerBoxShadow = useTransform(
    smoothProgress,
    [0.8, 1],
    ["0 1px 20px 0 rgba(0, 0, 0, 0)", "0 1px 20px 0 rgba(0, 0, 0, 0.1)"],
  );

  // Track scroll for sticky headers
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef?.current) {
        const progress = Math.min(contentRef.current.scrollTop / 50, 1);
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
        layout
        initial={false}
        className="sticky top-0 z-20 bg-background/80 backdrop-blur-md"
        style={{
          paddingTop: headerPadding,
          paddingBottom: headerPadding,
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: `rgba(115, 115, 115, ${borderOpacity.get()})`,
          boxShadow: headerBoxShadow,
        }}
      >
        {/* Main Row: Cover + Title/Author + Metadata */}
        <motion.div
          layout
          className="mx-auto flex w-full max-w-3xl flex-row items-start px-6 lg:px-10"
          style={{ gap: headerGap }}
        >
          {/* Cover Image */}
          <motion.div
            layout
            className="flex-shrink-0"
            style={{ width: coverWidth, height: coverHeight }}
          >
            {coverUrl ? (
              <motion.div layoutId={`book-cover-${bookId}`}>
                <Image
                  src={coverUrl}
                  alt={`${book.title} cover`}
                  className="h-full w-full rounded-lg object-cover shadow-md lg:shadow-[0px_8px_30px_rgba(0,0,0,0.15)]"
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

          {/* Title/Author + Metadata Column */}
          <motion.div
            layout
            className="relative min-w-0 flex-1 overflow-visible pr-6"
          >
            {/* Title & Author */}
            <motion.h2
              layout="position"
              style={{
                fontSize: titleFontSize,
                marginBottom: titleAuthorGap,
              }}
              className="line-clamp-2 font-bold leading-tight text-foreground"
            >
              {book.title}
            </motion.h2>

            <motion.p
              layout="position"
              style={{
                fontSize: authorFontSize,
              }}
              className="line-clamp-1 text-muted-foreground"
            >
              {book.author}
            </motion.p>

            {/* Metadata Section - Absolutely positioned */}
            <motion.div
              className="absolute left-0"
              style={{ top: metadataTop, width: metadataWidth }}
            >
              {/* Rating */}
              {book.rating && (
                <motion.div
                  className="mb-2 mt-3 flex gap-1"
                  style={{ opacity: ratingOpacity }}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon
                      key={i}
                      size={20}
                      weight="fill"
                      className={
                        i < book.rating! ? "text-yellow-400" : "text-body/20"
                      }
                    />
                  ))}
                </motion.div>
              )}

              {/* Dates */}
              <motion.div
                className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground/70"
                style={{ opacity: datesOpacity }}
              >
                {book.publicationYear && (
                  <div>
                    <span className="font-medium">Published:</span>{" "}
                    {book.publicationYear}
                  </div>
                )}
                {book.started && (
                  <div>
                    <span className="font-medium">Started:</span>{" "}
                    {new Date(book.started).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
                {book.finished && (
                  <div>
                    <span className="font-medium">Finished:</span>{" "}
                    {new Date(book.finished).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
              </motion.div>

              {/* Tags */}
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

              {/* Actions */}
              <motion.div
                className="-ml-3 mt-2 flex flex-wrap items-center gap-0"
                style={{ opacity: actionsOpacity }}
              >
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={book.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowSquareOutIcon size={12} weight="bold" />
                    View in Notion
                  </a>
                </Button>

                <Button variant="ghost" size="sm" onClick={onShare}>
                  <LinkIcon size={12} weight="bold" />
                  {copied ? "Copied!" : "Copy link"}
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Main content */}
      <div className="mx-auto w-full max-w-3xl p-6 lg:p-10">
        {/* Notes section */}
        {book.hasNotes ? (
          <div className="pb-[min(25vh,300px)] pt-8 lg:pt-10">
            {isLoadingNotes ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-title"></div>
                  <p className="text-sm text-muted-foreground">
                    Loading notes...
                  </p>
                </div>
              </div>
            ) : fullBook?.notes ? (
              <div
                className={cn(
                  "prose prose-sm prose-neutral max-w-none leading-relaxed text-foreground",
                  "prose-headings:mb-0 prose-headings:font-bold prose-headings:text-foreground prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-xs",
                  "prose-p:text-foreground prose-a:text-foreground prose-a:underline hover:prose-a:text-foreground prose-strong:font-bold prose-strong:text-foreground",
                  "prose-ol:list-decimal prose-ul:list-disc prose-li:text-foreground",
                  "prose-img:max-w-[500px] prose-img:rounded-lg prose-img:shadow-md",
                )}
              >
                <ReactMarkdown
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
                >
                  {fullBook.notes}
                </ReactMarkdown>
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
