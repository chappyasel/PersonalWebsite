"use client";

import { type MouseEvent, useCallback } from "react";

import { prefersFullPage } from "~/components/modal-sheet/sheetRoute";

import { useInlineBookPreview } from "./InlineBookPreviewProvider";
import type { BookArrival } from "~/app/books/lib/noteMatchLink";
import { navigateFullDocument } from "~/app/components/route-transition-prototype/documentNavigation";

/**
 * The click a link to a library book makes. Modified and non-primary clicks
 * follow the link. Small viewports load the book's own page. Elsewhere the
 * surface hosting the link opens the book: the Books app or an open book
 * over itself, a document in its own book modal. With no such surface the
 * link navigates. The modal flies out of `origin`'s box when one is given
 * (a row's cover), else out of the link's own. A link to a passage passes
 * its `arrival`, which `href` must already carry for the full-page case.
 */
export function useOpenBookLink() {
  const openBook = useInlineBookPreview();
  return useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      href: string,
      slug: string,
      origin?: Element | null,
      arrival?: BookArrival,
    ) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (prefersFullPage()) {
        event.preventDefault();
        navigateFullDocument(href, { source: event.currentTarget });
        return;
      }
      if (!openBook) return;
      event.preventDefault();
      openBook(
        slug,
        (origin ?? event.currentTarget).getBoundingClientRect(),
        arrival,
      );
    },
    [openBook],
  );
}
