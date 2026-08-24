import type { ReadingBookEdgeColor } from "../../../../lib/books/coverEdgeColor";

export type BootReadingBook = {
  id: string;
  /** Optional low-resolution cover used only by the loading-screen SVG. */
  coverSrc?: string | null;
  /** Exact live book-shell thickness, needed to project the inset cover face. */
  thickness?: number;
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

export function waitForBootReadingBooks(
  signal?: AbortSignal,
): Promise<BootReadingBooksSnapshot> {
  if (snapshot) return Promise.resolve(snapshot);
  return new Promise((resolve, reject) => {
    const stop = subscribeBootReadingBooks(() => {
      if (!snapshot) return;
      stop();
      signal?.removeEventListener("abort", abort);
      resolve(snapshot);
    });
    const abort = () => {
      stop();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Decode the exact cover URLs before the vignette tells the boot machine it
 * is finished. Errors resolve to the colored jacket fallback. The deadline
 * keeps a slow third-party cover from holding the whole room closed. */
export async function preloadBootReadingBookCovers(
  books: readonly BootReadingBook[],
  timeoutMs = 4_000,
): Promise<void> {
  if (typeof window === "undefined") return;
  const sources = books.flatMap(({ coverSrc }) => (coverSrc ? [coverSrc] : []));
  await Promise.all(
    sources.map(
      (source) =>
        new Promise<void>((resolve) => {
          const image = new window.Image();
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            resolve();
          };
          const timer = window.setTimeout(finish, timeoutMs);
          image.onload = finish;
          image.onerror = finish;
          image.src = source;
        }),
    ),
  );
}

/** Publishes the server-selected current reads after the async homepage
 * subtree streams in. The synchronous boot shell remains independent of the
 * books query, while its final animation frames still match the live shelf. */
export function publishBootReadingBooks(
  next: BootReadingBooksSnapshot,
): () => void {
  const published = {
    books: next.books.map(({ id, coverSrc, thickness }) => ({
      id,
      coverSrc,
      ...(thickness === undefined ? {} : { thickness }),
    })),
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
