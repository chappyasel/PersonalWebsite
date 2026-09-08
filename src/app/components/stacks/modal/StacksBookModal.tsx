"use client";

// The books-app modal, mounted on the home page with zero edits to the books
// app: BooksTRPCProvider > BookPreviewProvider > ModalHost. A bridge converts
// store.pendingBook (set by 3D cover clicks) into the books-app open pattern —
// pushState first (close calls history.back()), then openModal(book).
//
// Book URLs are real paths (/books/<id>): the books app serves on this host
// too (the proxy only rewrites the subdomains), so a refresh — or sharing the
// address bar — lands on the actual book page instead of re-booting the 3D
// scene. Legacy #book-<id> hash links still open the modal and get their URL
// upgraded to the path form.
import { ModalHost } from "../../../books/components/ModalHost";
import { BOOK_MODAL_HISTORY_STATE } from "../../../books/components/modalHistory";
import {
  BookPreviewProvider,
  useModalActions,
  useModalState,
} from "../../../books/contexts/BookPreviewContext";
import { subscribeBookPrefetch } from "../bookPrefetch";
import { UNITS } from "../data";
import { useStacks } from "../store";
import { useCallback, useEffect } from "react";

import { devSubdomainUrl } from "~/lib/util";
import { BooksTRPCProvider } from "~/trpc/books-provider";

import { loadFullPageOnSmallViewport } from "~/components/modal-sheet/sheetRoute";
import { api } from "~/trpc/react";

import { jumpToUnitWhenReady, ownDirectBookHistory } from "./bookModalSync";

const BOOK_HASH = /^#book-(.+)$/;
const BOOKS_UNIT = UNITS.findIndex((unit) => unit.slug === "books");

function booksBaseUrl(): string {
  return process.env.NODE_ENV === "production"
    ? "https://books.chappyasel.com"
    : devSubdomainUrl("books");
}

/** The book's own page on the books host — the modal's expand target, and
 * where a phone lands instead of the modal (components/modal-sheet/
 * sheetRoute), with nothing here changing before the document does. */
function bookPageUrl(id: string): string {
  return `${booksBaseUrl()}/${id}`;
}

function ModalBridge() {
  const utils = api.useUtils();
  const pendingBook = useStacks((s) => s.pendingBook);
  const setPendingBook = useStacks((s) => s.setPendingBook);
  const pendingBookId = useStacks((s) => s.pendingBookId);
  const setPendingBookId = useStacks((s) => s.setPendingBookId);
  const setModalOpen = useStacks((s) => s.setModalOpen);
  const { openModal, openModalById } = useModalActions();
  const { isModalOpen } = useModalState();

  useEffect(
    () =>
      subscribeBookPrefetch((bookId) => {
        void utils.books.getById.prefetch({ bookId });
      }),
    [utils],
  );

  // 3D cover click → pushState + instant open (the books-app pattern).
  useEffect(() => {
    if (!pendingBook) return;
    if (loadFullPageOnSmallViewport(bookPageUrl(pendingBook.id))) {
      setPendingBook(null);
      return;
    }
    window.history.pushState(
      BOOK_MODAL_HISTORY_STATE,
      "",
      `/books/${pendingBook.id}`,
    );
    openModal(pendingBook);
    setPendingBook(null);
  }, [pendingBook, openModal, setPendingBook]);

  // Packed-row spine click → open by id, the same resolution a #book- deep
  // link uses. Spine books stay out of `shelfBooks` on purpose (no cover to
  // warm, no full Book on the payload), so the books app fetches this one.
  useEffect(() => {
    if (!pendingBookId) return;
    if (loadFullPageOnSmallViewport(bookPageUrl(pendingBookId))) {
      setPendingBookId(null);
      return;
    }
    window.history.pushState(
      BOOK_MODAL_HISTORY_STATE,
      "",
      `/books/${pendingBookId}`,
    );
    openModalById(pendingBookId);
    setPendingBookId(null);
  }, [pendingBookId, openModalById, setPendingBookId]);

  // Mirror open state so bridges/placards can suspend themselves.
  useEffect(() => {
    setModalOpen(isModalOpen);
  }, [isModalOpen, setModalOpen]);

  // Legacy deep link: land on #book-<id> → open by id, travel to the
  // library, and upgrade the address bar to the real /books path.
  useEffect(() => {
    const match = BOOK_HASH.exec(window.location.hash);
    if (!match?.[1]) return;
    const id = decodeURIComponent(match[1]);
    // On a phone the deep link lands on the book's own page; a replace, so
    // back leaves the way the visitor came.
    if (loadFullPageOnSmallViewport(bookPageUrl(id), { replace: true }))
      return;
    ownDirectBookHistory(
      window.history,
      window.location,
      `/books/${encodeURIComponent(id)}`,
    );
    openModalById(id);
    return jumpToUnitWhenReady(useStacks, BOOKS_UNIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter needs no capture-phase override anymore: the modal's own handler
  // runs the expand takeover, and its hard fallback uses the presentation's
  // books-host href rather than the once-wrong local path.

  return null;
}

export default function StacksBookModal({ bookCount }: { bookCount: number }) {
  const setBookModalReturning = useStacks((s) => s.setBookModalReturning);
  const beginBookModalReturn = useCallback(
    () => setBookModalReturning(true),
    [setBookModalReturning],
  );

  return (
    <BooksTRPCProvider>
      <BookPreviewProvider>
        <ModalBridge />
        <ModalHost
          presentation={{
            source: "stacks",
            booksHref: booksBaseUrl(),
            bookCount,
            onCloseStart: beginBookModalReturn,
          }}
        />
      </BookPreviewProvider>
    </BooksTRPCProvider>
  );
}
