"use client";

import { BookDetailContent } from "../components/BookDetailContent";
import { RelatedBooks } from "../components/RelatedBooks";
import { BOOK_MODAL_HISTORY_STATE } from "../components/modalHistory";
import { useModalActions } from "../contexts/BookPreviewContext";
import { useBookPath } from "../hooks/useBookPath";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getBookShareUrl,
  getBooksPath,
  getBooksTagQuery,
} from "~/lib/books/paths";
import type { BaseBook, BookWithNotes } from "~/lib/books/types";
import { copyTextToClipboard } from "~/lib/clipboard";
import { recordModalOrigin } from "~/lib/originFlight";
import { ownsOverlayInput } from "~/lib/overlays/coordinator";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { api } from "~/trpc/react";

import { InlineBookOpener } from "~/components/books/InlineBookPreviewProvider";

import { requestPrototypeNavigation } from "~/app/components/route-transition-prototype/navigation";

type BookPageProps = {
  bookId: string;
  book: BaseBook & Pick<BookWithNotes, "notes" | "linkedBooks">;
  bookshelfBookCount: number;
};

export function BookPage({ bookId, book, bookshelfBookCount }: BookPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const handleClose = useCallback(() => {
    const href = getBooksPath();
    if (!requestPrototypeNavigation(href)) router.push(href);
  }, [router]);

  // Same directory-relative shape as the breadcrumb, so it resolves on both
  // hosts. This page is prerendered, so it cannot read the query the way the
  // modal does without giving that up; the breadcrumb drops it too.
  const tagHref = (tag: string) => getBooksPath(getBooksTagQuery(tag));

  // A book the notes link, or a related book, opens over this page on a
  // history entry of its own, so Back and the close control both return
  // here. It flies out of the link it was opened from and back into it
  // (recordModalOrigin): unlike a shelf cover, a link has no cover for the
  // book view to grow out of.
  const { openModalById } = useModalActions();
  const bookPath = useBookPath();
  const utils = api.useUtils();
  const prefetchLinkedBook = useCallback(
    (linkedBookId: string) =>
      void utils.books.getById.prefetch({ bookId: linkedBookId }),
    [utils],
  );
  const openLinkedBook = useCallback(
    (linkedBookId: string, origin: DOMRect) => {
      recordModalOrigin(origin);
      openModalById(linkedBookId);
      window.history.pushState(
        BOOK_MODAL_HISTORY_STATE,
        "",
        bookPath(linkedBookId),
      );
    },
    [openModalById, bookPath],
  );

  // Handle Escape key to navigate back to books grid. A book modal open over
  // the page takes Escape for itself.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUniversalSearchOpen() || !ownsOverlayInput(contentRef.current))
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

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
          <InlineBookOpener open={openLinkedBook} prefetch={prefetchLinkedBook}>
            <BookDetailContent
              book={book}
              fullBook={book}
              isLoadingNotes={false}
              contentRef={contentRef}
              onShare={handleShare}
              copied={copied}
              bookId={bookId}
              bookshelfBookCount={bookshelfBookCount}
              onClose={handleClose}
              tagHref={tagHref}
              relatedBooks={<RelatedBooks bookId={bookId} />}
            />
          </InlineBookOpener>
        </div>
      </div>
    </div>
  );
}
