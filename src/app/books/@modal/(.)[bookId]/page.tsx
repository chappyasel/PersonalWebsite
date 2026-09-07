"use client";

import {
  useModalActions,
  useModalState,
} from "../../contexts/BookPreviewContext";
import { use, useEffect } from "react";

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
