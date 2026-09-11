"use client";

import dynamic from "next/dynamic";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

import { recordModalOrigin } from "~/lib/originFlight";

import { inlineBookHistoryEntry } from "~/app/books/components/modalHistory";

const InlineBookModal = dynamic(() => import("./InlineBookModal"), {
  ssr: false,
});
const OpenBookContext = createContext<
  ((bookId: string, origin: DOMRect) => void) | null
>(null);

export function InlineBookPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [request, setRequest] = useState<{ bookId: string } | null>(null);
  const openBook = useCallback((bookId: string, origin: DOMRect) => {
    recordModalOrigin(origin);
    const entry = inlineBookHistoryEntry(bookId, window.location);
    window.history.pushState(entry.state, "", entry.href);
    setRequest({ bookId });
  }, []);

  return (
    <OpenBookContext.Provider value={openBook}>
      {children}
      {request && <InlineBookModal request={request} />}
    </OpenBookContext.Provider>
  );
}

export function useInlineBookPreview() {
  return useContext(OpenBookContext);
}
