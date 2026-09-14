"use client";

import { BookDetailContent } from "../components/BookDetailContent";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  getBookShareUrl,
  getBooksPath,
  getBooksTagQuery,
} from "~/lib/books/paths";
import type { BaseBook } from "~/lib/books/types";
import { copyTextToClipboard } from "~/lib/clipboard";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import { requestPrototypeNavigation } from "~/app/components/route-transition-prototype/navigation";

type BookPageProps = {
  bookId: string;
  book: BaseBook & { notes: string };
  bookshelfBookCount: number;
};

export function BookPage({ bookId, book, bookshelfBookCount }: BookPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  // Same directory-relative shape as the breadcrumb, so it resolves on both
  // hosts. This page is prerendered, so it cannot read the query the way the
  // modal does without giving that up; the breadcrumb drops it too.
  const tagHref = (tag: string) => getBooksPath(getBooksTagQuery(tag));

  // Handle Escape key to navigate back to books grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!requestPrototypeNavigation("/books")) router.push("/books");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Handle share button click
  const handleShare = async () => {
    const shareUrl = getBookShareUrl(bookId);
    const didCopy = await copyTextToClipboard(shareUrl);
    if (!didCopy) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="-m-6 min-h-[100dvh] bg-background md:-m-8">
      <div className="flex min-h-[100dvh] flex-col">
        {/* Content Container */}
        <div className="flex min-h-[100dvh] flex-col bg-background">
          <BookDetailContent
            book={book}
            fullBook={book}
            isLoadingNotes={false}
            contentRef={contentRef}
            onShare={handleShare}
            copied={copied}
            bookId={bookId}
            bookshelfBookCount={bookshelfBookCount}
            tagHref={tagHref}
          />
        </div>
      </div>
    </div>
  );
}
