"use client";

import { useModalState } from "../contexts/BookPreviewContext";
import { useBookPath } from "../hooks/useBookPath";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getBookPath } from "~/lib/books/paths";

import { prefersFullPage } from "~/components/modal-sheet/sheetRoute";

const Modal = dynamic(() => import("./Modal").then((module) => module.Modal), {
  ssr: false,
});

export type ModalPresentation = {
  /** The modal was opened outside the Books library. */
  source: "stacks" | "document";
  /** Absolute in production, dev-subdomain URL locally. */
  booksHref: string;
  /** Same source-of-truth count shown by the standalone detail breadcrumb. */
  bookCount?: number;
  /** Lets the 3D homepage prepare its frozen room before modal teardown. */
  onCloseStart?: () => void;
};

/** The book's own page: its path on the books host, the cross-host URL
 * over the 3D homepage (book pages resolve on the books subdomain). The
 * modal's expand control and the phone-size net below both point here. */
export function fullBookPageHref(
  bookId: string,
  presentation?: ModalPresentation,
  bookPath = getBookPath(bookId),
): string {
  return presentation ? `${presentation.booksHref}/${bookId}` : bookPath;
}

export function ModalHost({
  presentation,
}: {
  presentation?: ModalPresentation;
}) {
  const { isModalOpen, selectedBookId } = useModalState();
  const bookPath = useBookPath();
  // The net under the openers' own phone-size checks (sheetRoute.ts): every
  // opener pushes the book's history entry as it opens, so if the modal is
  // still asked to open on a small viewport, replacing that entry with the
  // full page keeps back on the shelf or the world. Nothing renders
  // meanwhile.
  const fullPageHref = selectedBookId
    ? fullBookPageHref(selectedBookId, presentation, bookPath(selectedBookId))
    : null;
  const bypassed = isModalOpen && fullPageHref !== null && prefersFullPage();
  useEffect(() => {
    if (bypassed && fullPageHref) window.location.replace(fullPageHref);
  }, [bypassed, fullPageHref]);
  // Mount the modal chunk before the first click rather than because of it.
  // Loading it on open lands the modal a commit too late for framer-motion's
  // shared `layoutId` handoff, so the modal fades in instead of morphing out of
  // the book cover. Warming on idle keeps it off the critical path.
  const [isWarm, setIsWarm] = useState(false);

  useEffect(() => {
    if (isWarm) return;
    // Keep the history listener mounted after a quick open/close, too.
    if (isModalOpen) {
      setIsWarm(true);
      return;
    }

    const warm = () => setIsWarm(true);
    const events = ["pointermove", "pointerdown", "keydown", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, warm, { once: true, passive: true }),
    );

    const supportsIdle = "requestIdleCallback" in window;
    const idleHandle = supportsIdle
      ? window.requestIdleCallback(warm, { timeout: 2000 })
      : window.setTimeout(warm, 500);

    return () => {
      events.forEach((event) => window.removeEventListener(event, warm));
      if (supportsIdle) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [isWarm, isModalOpen]);

  if (bypassed) return null;
  return isModalOpen || isWarm ? <Modal presentation={presentation} /> : null;
}
