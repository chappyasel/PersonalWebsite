"use client";

import { LayoutGroup } from "framer-motion";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
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
  setKeyboardFocus: (index: number | null, bookId: string | null) => void;
  clearKeyboardFocus: () => void;
};

// State context - changes when modal opens/closes
type ModalStateContextType = {
  selectedBook: Book | null;
  selectedBookId: string | null;
  selectedSize: "S" | "M" | "L" | null;
  isModalOpen: boolean;
  keyboardFocusedIndex: number | null;
  keyboardFocusedBookId: string | null;
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
  const [keyboardFocusedIndex, setKeyboardFocusedIndex] = useState<
    number | null
  >(null);
  const [keyboardFocusedBookId, setKeyboardFocusedBookId] = useState<
    string | null
  >(null);

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

  const setKeyboardFocus = useCallback(
    (index: number | null, bookId: string | null) => {
      setKeyboardFocusedIndex(index);
      setKeyboardFocusedBookId(bookId);
    },
    [],
  );

  const clearKeyboardFocus = useCallback(() => {
    setKeyboardFocusedIndex(null);
    setKeyboardFocusedBookId(null);
  }, []);

  // Browser back/forward is handled by the Modal itself, which can play its
  // exit flight on a pop and reopen on a forward — see Modal's popstate
  // effect. The Modal is always mounted while open, so nothing is missed.

  // Memoize actions - these never change
  const actions = useMemo(
    () => ({
      openModal,
      openModalById,
      closeModal,
      setSelectedBook,
      setKeyboardFocus,
      clearKeyboardFocus,
    }),
    [
      openModal,
      openModalById,
      closeModal,
      setSelectedBook,
      setKeyboardFocus,
      clearKeyboardFocus,
    ],
  );

  // State value - changes when modal state changes
  const state = useMemo(
    () => ({
      selectedBook,
      selectedBookId,
      selectedSize,
      isModalOpen,
      keyboardFocusedIndex,
      keyboardFocusedBookId,
    }),
    [
      selectedBook,
      selectedBookId,
      selectedSize,
      isModalOpen,
      keyboardFocusedIndex,
      keyboardFocusedBookId,
    ],
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
      setKeyboardFocus: (_index, _bookId) => undefined,
      clearKeyboardFocus: () => undefined,
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
      keyboardFocusedIndex: null,
      keyboardFocusedBookId: null,
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
