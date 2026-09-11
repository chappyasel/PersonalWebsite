/** Stamped on every history entry the book MODAL pushes (as opposed to a
 * real book-page navigation the Next router owns). Forward onto a stamped
 * entry reopens the modal; forward onto a router entry must not — the page
 * itself is the book there. Next's history sync leaves custom state on
 * native pushes intact. */
export const BOOK_MODAL_HISTORY_STATE = { bookModal: true };

/** Document subdomains rewrite every path into their own app. Keep their
 * modal URL on the document; the modal's Share link remains the canonical book URL. */
export function inlineBookHistoryEntry(
  bookId: string,
  location: Pick<Location, "hostname" | "pathname" | "search">,
) {
  const onDocumentHost = /^(manual|routine)\./.test(location.hostname);
  const pathname = onDocumentHost
    ? location.pathname
    : `/books/${encodeURIComponent(bookId)}`;
  return {
    href: onDocumentHost
      ? `${pathname}${location.search}#book-${encodeURIComponent(bookId)}`
      : pathname,
    state: {
      ...BOOK_MODAL_HISTORY_STATE,
      inlineBookModal: true,
      bookId,
      inlineBookPath: pathname,
    },
  };
}

export function inlineBookIdFromHistory(
  pathname: string,
  state: unknown,
): string | null {
  if (!isBookModalHistoryState(state, "document")) return null;
  const entry = state as { inlineBookPath?: unknown; bookId?: unknown };
  return entry.inlineBookPath === pathname && typeof entry.bookId === "string"
    ? entry.bookId
    : null;
}

export function isBookModalHistoryState(
  state: unknown,
  source?: "stacks" | "document",
): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { bookModal?: unknown }).bookModal === true &&
    ((state as { inlineBookModal?: unknown }).inlineBookModal === true) ===
      (source === "document")
  );
}

const STACKS_BOOK_PATH = /^\/books\/([^/]+)\/?$/;
const BOOKS_SITE_PATH = /^\/([^/]+)\/?$/;

/** The book a pathname names, under either presentation: `/books/<id>` over
 * the stacks homepage, `/<id>` on the books site (where every single-segment
 * path is a book page). Null when the path names no book. */
export function bookIdFromPathname(
  pathname: string,
  fromStacks: boolean,
): string | null {
  const match = (fromStacks ? STACKS_BOOK_PATH : BOOKS_SITE_PATH).exec(
    pathname,
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
