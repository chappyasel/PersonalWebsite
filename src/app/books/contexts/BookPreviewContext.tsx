"use client";

import { LayoutGroup } from "framer-motion";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Book } from "~/lib/books/types";

// Actions context - stable references, never causes re-renders
type ModalActionsContextType = {
  openModal: (book: Book, size?: "S" | "M" | "L") => void;
  openModalById: (bookId: string) => void;
  closeModal: () => void;
  setSelectedBook: (book: Book | null, size?: "S" | "M" | "L") => void;
};

// State context - changes when modal opens/closes
type ModalStateContextType = {
  selectedBook: Book | null;
  selectedBookId: string | null;
  selectedSize: "S" | "M" | "L" | null;
  isModalOpen: boolean;
};

const ModalActionsContext = createContext<ModalActionsContextType | undefined>(
  undefined,
);

const ModalStateContext = createContext<ModalStateContextType | undefined>(
  undefined,
);

export function BookPreviewProvider({ children }: { children: ReactNode }) {
  const [selectedBook, setSelectedBookState] = useState<Book | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<"S" | "M" | "L" | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const setSelectedBook = useCallback(
    (book: Book | null, size?: "S" | "M" | "L") => {
      setSelectedBookState(book);
      setSelectedBookId(book?.id ?? null);
      setSelectedSize(size ?? null);
    },
    [],
  );

  const openModal = useCallback((book: Book, size?: "S" | "M" | "L") => {
    setSelectedBookState(book);
    setSelectedBookId(book.id);
    setSelectedSize(size ?? null);
    setIsModalOpen(true);
  }, []);

  const openModalById = useCallback((bookId: string) => {
    setSelectedBookId(bookId);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const isBookPage = pathname !== "/" && pathname.length > 1;
      if (!isBookPage) {
        setIsModalOpen(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Memoize actions - these never change
  const actions = useMemo(
    () => ({
      openModal,
      openModalById,
      closeModal,
      setSelectedBook,
    }),
    [openModal, openModalById, closeModal, setSelectedBook],
  );

  // State value - changes when modal state changes
  const state = useMemo(
    () => ({
      selectedBook,
      selectedBookId,
      selectedSize,
      isModalOpen,
    }),
    [selectedBook, selectedBookId, selectedSize, isModalOpen],
  );

  return (
    <ModalActionsContext.Provider value={actions}>
      <ModalStateContext.Provider value={state}>
        <LayoutGroup>{children}</LayoutGroup>
      </ModalStateContext.Provider>
    </ModalActionsContext.Provider>
  );
}

// Hook for components that only need actions (like BookCard)
// This won't cause re-renders when modal state changes
export function useModalActions(): ModalActionsContextType {
  const context = useContext(ModalActionsContext);
  if (!context) {
    // Fallback no-op implementations for use outside provider
    return {
      openModal: (_book, _size) => undefined,
      openModalById: (_bookId) => undefined,
      closeModal: () => undefined,
      setSelectedBook: (_book, _size) => undefined,
    };
  }
  return context;
}

// Hook for components that need modal state (like StateControlledModal)
export function useModalState(): ModalStateContextType {
  const context = useContext(ModalStateContext);
  if (!context) {
    return {
      selectedBook: null,
      selectedBookId: null,
      selectedSize: null,
      isModalOpen: false,
    };
  }
  return context;
}

// Combined hook for backwards compatibility
export function useBookPreview() {
  const actions = useModalActions();
  const state = useModalState();
  return { ...state, ...actions };
}
