"use client";

import {
  useModalActions,
  useModalState,
} from "../../contexts/BookPreviewContext";
import { use, useEffect } from "react";

import { loadFullPageOnSmallViewport } from "~/components/modal-sheet/sheetRoute";

type PageProps = {
  params: Promise<{ bookId: string }>;
};

export default function BookModalPage({ params }: PageProps) {
  const { bookId } = use(params);
  const { openModalById } = useModalActions();
  const { isModalOpen } = useModalState();

  // A soft navigation to a book (a search jump on the books host) lands
  // here: open the modal via context, and the ModalHost in the layout renders
  // it. On a phone the book is its own page instead. The address bar already
  // reads it, so a replace loads it with back still on the page the jump
  // left.
  useEffect(() => {
    if (isModalOpen) return;
    if (
      loadFullPageOnSmallViewport(
        `${window.location.pathname}${window.location.search}`,
        { replace: true },
      )
    )
      return;
    openModalById(bookId);
  }, [bookId, openModalById, isModalOpen]);

  // Return null - the StateControlledModal handles all rendering
  return null;
}
