"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Book } from "~/lib/books/types";

type BookPreviewContextType = {
  selectedBook: Book | null;
  selectedSize: "S" | "M" | "L" | null;
  setSelectedBook: (book: Book | null, size?: "S" | "M" | "L") => void;
};

const BookPreviewContext = createContext<BookPreviewContextType | undefined>(
  undefined,
);

export function BookPreviewProvider({ children }: { children: ReactNode }) {
  const [selectedBook, setSelectedBookState] = useState<Book | null>(null);
  const [selectedSize, setSelectedSize] = useState<"S" | "M" | "L" | null>(null);

  const setSelectedBook = (book: Book | null, size?: "S" | "M" | "L") => {
    setSelectedBookState(book);
    setSelectedSize(size ?? null);
  };

  return (
    <BookPreviewContext.Provider value={{ selectedBook, selectedSize, setSelectedBook }}>
      {children}
    </BookPreviewContext.Provider>
  );
}

export function useBookPreview() {
  const context = useContext(BookPreviewContext);
  if (!context) {
    // Return a default value instead of throwing - this handles edge cases during hydration
    return {
      selectedBook: null,
      selectedSize: null,
      setSelectedBook: () => {},
    };
  }
  return context;
}
