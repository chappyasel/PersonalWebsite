"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/react";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { getTagColor } from "~/lib/books/tagColors";

type BookModalProps = {
  bookId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export function BookModal({ bookId, isOpen, onClose }: BookModalProps) {
  const {
    data: book,
    isLoading,
    error,
  } = api.books.getById.useQuery(
    { bookId: bookId ?? "" },
    {
      enabled: isOpen && !!bookId,
      staleTime: Infinity,
    },
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Track scroll for mobile header
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setIsScrolled(contentRef.current.scrollTop > 100);
      }
    };

    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.addEventListener("scroll", handleScroll);
      return () => contentEl.removeEventListener("scroll", handleScroll);
    }
  }, [isOpen]);

  const coverUrl = book ? enhanceCoverUrl(book.coverUrl) : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                className="relative w-full max-w-5xl"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative overflow-hidden rounded-3xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.3)]">
                  {/* Close button */}
                  <button
                    onClick={onClose}
                    className="absolute right-6 top-6 z-10 rounded-full bg-background/80 p-2 backdrop-blur-sm transition-all hover:bg-background"
                    aria-label="Close modal"
                  >
                    <X size={20} className="text-title" />
                  </button>

                  {/* Content */}
                  {isLoading && (
                    <div className="flex h-96 items-center justify-center p-8">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-body/20 border-t-title"></div>
                        <p className="text-sm text-body">Loading...</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex h-96 flex-col items-center justify-center gap-4 p-8">
                      <p className="text-center text-body">
                        Failed to load book details
                      </p>
                      <button
                        onClick={onClose}
                        className="rounded-lg bg-title px-6 py-2 text-background transition-colors hover:bg-body"
                      >
                        Close
                      </button>
                    </div>
                  )}

                  {book && !isLoading && !error && (
                    <div
                      ref={contentRef}
                      className="relative max-h-[85vh] overflow-y-auto"
                    >
                      {/* Mobile sticky header */}
                      <div
                        className={`sticky top-0 z-20 bg-background/95 backdrop-blur-sm transition-all duration-300 lg:hidden ${
                          isScrolled
                            ? "border-b border-body/10 py-3 shadow-sm"
                            : "py-6"
                        }`}
                      >
                        <div className="flex items-center gap-4 px-6">
                          {coverUrl && (
                            <img
                              src={coverUrl}
                              alt={`${book.title} cover`}
                              className={`rounded-lg shadow-md transition-all duration-300 ${
                                isScrolled
                                  ? "h-12 w-8"
                                  : "h-32 w-24"
                              }`}
                            />
                          )}
                          {isScrolled && (
                            <div className="flex-1 overflow-hidden">
                              <h3 className="truncate text-sm font-bold text-title">
                                {book.title}
                              </h3>
                              <p className="truncate text-xs text-body">
                                {book.author}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Main content */}
                      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        {/* Left: Info */}
                        <div className="space-y-8 p-6 lg:p-10">
                          {/* Cover - desktop only */}
                          <div className="hidden lg:block">
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={`${book.title} cover`}
                                className="mx-auto w-full max-w-[240px] rounded-xl shadow-[0px_10px_40px_rgba(0,0,0,0.2)]"
                              />
                            ) : (
                              <div className="mx-auto flex aspect-[2/3] w-full max-w-[240px] items-center justify-center rounded-xl bg-cell p-6 text-center shadow-[0px_10px_40px_rgba(0,0,0,0.1)]">
                                <p className="text-base font-bold text-title">
                                  {book.title}
                                </p>
                              </div>
                            )}

                            {/* Rating */}
                            {book.rating && (
                              <div className="mt-6 flex justify-center gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <svg
                                    key={i}
                                    className={`h-5 w-5 ${i < book.rating! ? "fill-yellow-400" : "fill-body/20"}`}
                                    viewBox="0 0 20 20"
                                  >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Header info */}
                          <div>
                            <h2 className="mb-3 text-4xl font-bold leading-tight text-title">
                              {book.title}
                            </h2>
                            <p className="mb-4 text-xl text-body">
                              {book.author}
                            </p>

                            {/* Metadata */}
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-body/70">
                              {book.publicationYear && (
                                <div>
                                  <span className="font-medium">
                                    Published:
                                  </span>{" "}
                                  {book.publicationYear}
                                </div>
                              )}
                              {book.started && (
                                <div>
                                  <span className="font-medium">Started:</span>{" "}
                                  {new Date(book.started).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </div>
                              )}
                              {book.finished && (
                                <div>
                                  <span className="font-medium">Finished:</span>{" "}
                                  {new Date(book.finished).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Tags */}
                            {book.tags.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {book.tags.map((tag) => {
                                  const colors = getTagColor(tag);
                                  return (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      style={{
                                        backgroundColor: colors.bg,
                                        color: colors.fg,
                                        borderColor: colors.border,
                                      }}
                                    >
                                      {tag}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* View in Notion */}
                          <div className="border-t border-body/10 pt-6">
                            <a
                              href={book.notionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-title transition-colors hover:text-body"
                            >
                              View in Notion
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          </div>
                        </div>

                        {/* Right: Notes */}
                        {book.notes && (
                          <div className="p-6 lg:border-l lg:border-body/10 lg:p-10">
                            <div className="prose prose-neutral prose-sm max-w-none leading-relaxed text-body prose-headings:font-bold prose-headings:text-title prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg prose-h5:text-base prose-h6:text-sm prose-p:text-body prose-a:text-title prose-a:underline hover:prose-a:text-body prose-strong:text-title prose-strong:font-bold prose-ul:list-disc prose-ol:list-decimal prose-li:text-body prose-img:rounded-lg prose-img:shadow-md">
                              <ReactMarkdown
                                urlTransform={(url) => {
                                  // Allow Notion S3 image URLs
                                  if (url.includes("prod-files-secure.s3")) {
                                    return url;
                                  }
                                  // Use default transform for security on other URLs
                                  return defaultUrlTransform(url);
                                }}
                                components={{
                                  h1: ({ node, ...props }) => (
                                    <h1
                                      className="mb-4 mt-8 text-3xl font-bold"
                                      {...props}
                                    />
                                  ),
                                  h2: ({ node, ...props }) => (
                                    <h2
                                      className="mb-3 mt-6 text-2xl font-bold"
                                      {...props}
                                    />
                                  ),
                                  h3: ({ node, ...props }) => (
                                    <h3
                                      className="mb-2 mt-4 text-xl font-bold"
                                      {...props}
                                    />
                                  ),
                                  h4: ({ node, ...props }) => (
                                    <h4
                                      className="mb-2 mt-3 text-lg font-bold"
                                      {...props}
                                    />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul
                                      className="my-3 list-disc space-y-1 pl-6"
                                      {...props}
                                    />
                                  ),
                                  ol: ({ node, ...props }) => (
                                    <ol
                                      className="my-3 list-decimal space-y-1 pl-6"
                                      {...props}
                                    />
                                  ),
                                  li: ({ node, ...props }) => (
                                    <li className="text-body" {...props} />
                                  ),
                                  img: ({ node, ...props }) => (
                                    <img
                                      className="my-4 rounded-lg shadow-md"
                                      {...props}
                                    />
                                  ),
                                }}
                              >
                                {book.notes}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
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
