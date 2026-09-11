"use client";

import { useCallback, useSyncExternalStore } from "react";

import { getBookPath } from "~/lib/books/paths";

const subscribe = () => () => undefined;

// Like useWlPath: shared HTML starts with the main-app path, then standalone
// Books hosts use their short path after hydration. No server-only host lookup.
export function useBookPath() {
  const onSubdomain = useSyncExternalStore(
    subscribe,
    () => window.location.hostname.startsWith("books."),
    () => false,
  );
  return useCallback(
    (bookId: string, query?: string) =>
      getBookPath(bookId, query, onSubdomain ? "" : "/books"),
    [onSubdomain],
  );
}
