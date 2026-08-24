"use client";

// The books-app modal, mounted on the home page with zero edits to the books
// app: BooksTRPCProvider > BookPreviewProvider > ModalHost. A bridge converts
// store.pendingBook (set by 3D cover clicks) into the books-app open pattern —
// pushState first (close calls history.back()), then openModal(book).
//
// Book URLs use a hash (#book-<id>) rather than a path: the home domain has no
// /books route, so a path would 404 on reload; the hash reloads cleanly and
// reopens the modal.
import { ModalHost } from "../../../books/components/ModalHost";
import { shouldUseModalEnterShortcut } from "../../../books/components/modalKeyboard";
import {
  BookPreviewProvider,
  useModalActions,
  useModalState,
} from "../../../books/contexts/BookPreviewContext";
import { UNITS } from "../data";
import { useStacks } from "../store";
import { useEffect } from "react";

import { devSubdomainUrl } from "~/lib/util";
import { BooksTRPCProvider } from "~/trpc/books-provider";

import { jumpToUnitWhenReady, ownDirectBookHashHistory } from "./bookModalSync";

const BOOK_HASH = /^#book-(.+)$/;
const BOOKS_UNIT = UNITS.findIndex((unit) => unit.slug === "books");

function booksBaseUrl(): string {
  return process.env.NODE_ENV === "production"
    ? "https://books.chappyasel.com"
    : devSubdomainUrl("books");
}

function ModalBridge() {
  const pendingBook = useStacks((s) => s.pendingBook);
  const setPendingBook = useStacks((s) => s.setPendingBook);
  const pendingBookId = useStacks((s) => s.pendingBookId);
  const setPendingBookId = useStacks((s) => s.setPendingBookId);
  const setModalOpen = useStacks((s) => s.setModalOpen);
  const { openModal, openModalById } = useModalActions();
  const { isModalOpen, selectedBookId } = useModalState();

  // 3D cover click → pushState + instant open (the books-app pattern).
  useEffect(() => {
    if (!pendingBook) return;
    window.history.pushState(null, "", `#book-${pendingBook.id}`);
    openModal(pendingBook);
    setPendingBook(null);
  }, [pendingBook, openModal, setPendingBook]);

  // Packed-row spine click → open by id, the same resolution a #book- deep
  // link uses. Spine books stay out of `shelfBooks` on purpose (no cover to
  // warm, no full Book on the payload), so the books app fetches this one.
  useEffect(() => {
    if (!pendingBookId) return;
    window.history.pushState(null, "", `#book-${pendingBookId}`);
    openModalById(pendingBookId);
    setPendingBookId(null);
  }, [pendingBookId, openModalById, setPendingBookId]);

  // Mirror open state so bridges/placards can suspend themselves.
  useEffect(() => {
    setModalOpen(isModalOpen);
  }, [isModalOpen, setModalOpen]);

  // Deep link: land on #book-<id> → open by id and travel to the library.
  useEffect(() => {
    const match = BOOK_HASH.exec(window.location.hash);
    if (!match?.[1]) return;
    ownDirectBookHashHistory(window.history, window.location);
    openModalById(decodeURIComponent(match[1]));
    return jumpToUnitWhenReady(useStacks, BOOKS_UNIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The modal's own Enter handler navigates to `/${bookId}` — correct on the
  // books subdomain, a 404 here. Capture first and send it to the books site.
  useEffect(() => {
    if (!isModalOpen || !selectedBookId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldUseModalEnterShortcut(e)) return;
      if (document.querySelector(".PhotoView-Portal")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.href = `${booksBaseUrl()}/${selectedBookId}`;
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isModalOpen, selectedBookId]);

  return null;
}

export default function StacksBookModal({ bookCount }: { bookCount: number }) {
  return (
    <BooksTRPCProvider>
      <BookPreviewProvider>
        <ModalBridge />
        <ModalHost
          presentation={{
            source: "stacks",
            booksHref: booksBaseUrl(),
            bookCount,
          }}
        />
      </BookPreviewProvider>
    </BooksTRPCProvider>
  );
}
