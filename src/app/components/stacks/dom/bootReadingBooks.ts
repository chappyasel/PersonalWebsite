import type { ReadingBookEdgeColor } from "../../../../lib/books/coverEdgeColor";

export type BootReadingBook = {
  id: string;
  /** Optional low-resolution cover used only by the loading-screen SVG. */
  coverSrc?: string | null;
};

export type BootReadingBooksSnapshot = {
  books: BootReadingBook[];
  colors: Record<string, ReadingBookEdgeColor>;
};

let snapshot: BootReadingBooksSnapshot | null = null;
const listeners = new Set<() => void>();

export function getBootReadingBooks(): BootReadingBooksSnapshot | null {
  return snapshot;
}

export function getServerBootReadingBooks(): null {
  return null;
}

export function subscribeBootReadingBooks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publishes the server-selected current reads after the async homepage
 * subtree streams in. The synchronous boot shell remains independent of the
 * books query, while its final animation frames still match the live shelf. */
export function publishBootReadingBooks(
  next: BootReadingBooksSnapshot,
): () => void {
  const published = {
    books: next.books.map(({ id, coverSrc }) => ({ id, coverSrc })),
    colors: { ...next.colors },
  };
  snapshot = published;
  for (const listener of listeners) listener();

  return () => {
    if (snapshot !== published) return;
    snapshot = null;
    for (const listener of listeners) listener();
  };
}

export function resetBootReadingBooks(): void {
  if (snapshot === null) return;
  snapshot = null;
  for (const listener of listeners) listener();
}
