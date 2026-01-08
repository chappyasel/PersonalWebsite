"use client";

import { use, useEffect } from "react";
import { useModalActions, useModalState } from "../../contexts/BookPreviewContext";

type PageProps = {
  params: Promise<{ bookId: string }>;
};

export default function BookModalPage({ params }: PageProps) {
  const { bookId } = use(params);
  const { openModalById } = useModalActions();
  const { isModalOpen } = useModalState();

  // For hard navigation (direct URL access), open the modal via context
  // The StateControlledModal in the layout will handle rendering
  useEffect(() => {
    if (!isModalOpen) {
      openModalById(bookId);
    }
  }, [bookId, openModalById, isModalOpen]);

  // Return null - the StateControlledModal handles all rendering
  return null;
}
