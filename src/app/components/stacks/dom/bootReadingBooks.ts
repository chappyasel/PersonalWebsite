import type { ReadingBookEdgeColor } from "../../../../lib/books/coverEdgeColor";
import { setExpectedBootBookFaces } from "../loading";

export type BootReadingBook = {
  id: string;
  /** Final, size-bounded URL so the boot entry imports no image machinery. */
  coverSrc?: string | null;
};

export type BootReadingBooksSnapshot = {
  books: BootReadingBook[];
  colors: Record<string, ReadingBookEdgeColor>;
};

export function bootReadingBookFaceKey(book: BootReadingBook): string | null {
  return book.coverSrc ? `${book.id}\u0000${book.coverSrc}` : null;
}

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
  setExpectedBootBookFaces(
    published.books.flatMap((book) => bootReadingBookFaceKey(book) ?? []),
  );
  snapshot = published;
  for (const listener of listeners) listener();

  return () => {
    if (snapshot !== published) return;
    snapshot = null;
    setExpectedBootBookFaces([]);
    for (const listener of listeners) listener();
  };
}

export function resetBootReadingBooks(): void {
  if (snapshot === null) return;
  snapshot = null;
  setExpectedBootBookFaces([]);
  for (const listener of listeners) listener();
}
