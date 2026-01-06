"use client";

import {
  ArrowSquareOut,
  NotionLogoIcon,
  ShareNetwork,
  Star,
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

// Animation configuration constants matching BooksGrid.tsx
const SPRING_CONFIG = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
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

  // Unified responsive transforms
  const coverWidth = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [128, 36] : [96, 32],
  );
  const coverHeight = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [192, 52] : [128, 48],
  );
  const titleFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [36, 14] : [24, 14],
  );
  const authorFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [20, 12] : [16, 12],
  );
  const headerGap = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [24, 12] : [12, 16],
  );
  const verticalPadding = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? [24, 8] : [24, 8],
  );
  const titleAuthorGap = useTransform(smoothProgress, [0, 1], [8, 2]);
  const metadataOpacity = useTransform(smoothProgress, [0, 0.3], [1, 0]);
  const headerBorderBottom = useTransform(
    smoothProgress,
    [0, 1],
    ["0px solid transparent", "1px solid rgba(115, 115, 115, 0.1)"],
  );
  const headerBoxShadow = useTransform(
    smoothProgress,
    [0, 1],
    ["none", "0 1px 2px 0 rgba(0, 0, 0, 0.05)"],
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
        layout
        initial={false}
        className="sticky top-0 z-20 bg-background/95 px-6 backdrop-blur-sm lg:px-10 lg:pt-10"
        style={{
          paddingTop: verticalPadding,
          paddingBottom: verticalPadding,
          borderBottom: headerBorderBottom,
          boxShadow: headerBoxShadow,
        }}
      >
        {/* Main Row: Cover + Title/Author + Metadata */}
        <motion.div
          layout
          className="flex flex-row items-start"
          style={{ gap: headerGap }}
        >
          {/* Cover Image */}
          <motion.div layout className="flex-shrink-0">
            {coverUrl ? (
              <motion.div layoutId={`book-cover-${bookId}`}>
                <motion.div
                  layout
                  style={{
                    width: coverWidth,
                    height: coverHeight,
                  }}
                  className="overflow-hidden"
                >
                  <Image
                    src={coverUrl}
                    alt={`${book.title} cover`}
                    className="h-full w-full rounded-lg object-cover shadow-md lg:shadow-[0px_8px_30px_rgba(0,0,0,0.15)]"
                    width={1000}
                    height={1500}
                    priority
                  />
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                layout
                style={{
                  width: coverWidth,
                  height: coverHeight,
                }}
                className="flex items-center justify-center rounded-lg bg-muted p-2 text-center shadow-md"
              >
                <p className="text-xs font-bold text-foreground">
                  {book.title}
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Title/Author + Metadata Column */}
          <motion.div layout className="min-w-0 flex-1 overflow-hidden">
            {/* Title & Author */}
            <motion.h2
              layout="position"
              style={{
                fontSize: titleFontSize,
                marginBottom: titleAuthorGap,
              }}
              className="font-bold leading-tight text-foreground"
            >
              <motion.span
                style={{
                  display: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["inline" as const, "block" as const],
                  ),
                  overflow: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["visible" as const, "hidden" as const],
                  ),
                  textOverflow: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["clip" as const, "ellipsis" as const],
                  ),
                  whiteSpace: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["normal" as const, "nowrap" as const],
                  ),
                }}
              >
                {book.title}
              </motion.span>
            </motion.h2>

            <motion.p
              layout="position"
              style={{
                fontSize: authorFontSize,
              }}
              className="text-muted-foreground"
            >
              <motion.span
                style={{
                  display: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["inline" as const, "block" as const],
                  ),
                  overflow: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["visible" as const, "hidden" as const],
                  ),
                  textOverflow: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["clip" as const, "ellipsis" as const],
                  ),
                  whiteSpace: useTransform(
                    smoothProgress,
                    [0.5, 1],
                    ["normal" as const, "nowrap" as const],
                  ),
                }}
              >
                {book.author}
              </motion.span>
            </motion.p>

            {/* Metadata Section - Below Author, Fades out on scroll */}
            <motion.div layout style={{ opacity: metadataOpacity }}>
              {/* Rating */}
              {book.rating && (
                <div className="mb-3 mt-3 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={20}
                      weight="fill"
                      className={
                        i < book.rating! ? "text-yellow-400" : "text-body/20"
                      }
                    />
                  ))}
                </div>
              )}

              {/* Dates */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground/70">
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
              </div>

              {/* Tags */}
              {book.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {book.tags.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={book.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowSquareOut size={12} weight="bold" />
                    View in Notion
                  </a>
                </Button>

                <Button variant="ghost" size="sm" onClick={onShare}>
                  <ShareNetwork size={12} weight="bold" />
                  {copied ? "Copied!" : "Share"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Main content */}
      <div className="p-6 lg:p-10">
        {/* Notes section */}
        {book.hasNotes ? (
          <div className="border-t border-muted-foreground/10 pt-8 lg:pt-10">
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
