type BookPrefetchListener = (bookId: string) => void;

const listeners = new Set<BookPrefetchListener>();
const queued = new Set<string>();

/** Request the Books query cache from code outside its React provider. */
export function requestBookPrefetch(bookId: string) {
  if (!bookId) return;
  if (listeners.size === 0) {
    queued.add(bookId);
    return;
  }
  for (const listener of listeners) listener(bookId);
}

/** Mounted by StacksBookModal, the owner of the Books tRPC provider. */
export function subscribeBookPrefetch(listener: BookPrefetchListener) {
  listeners.add(listener);
  for (const bookId of queued) listener(bookId);
  queued.clear();
  return () => {
    listeners.delete(listener);
  };
}
