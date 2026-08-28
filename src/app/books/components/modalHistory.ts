/** Stamped on every history entry the book MODAL pushes (as opposed to a
 * real book-page navigation the Next router owns). Forward onto a stamped
 * entry reopens the modal; forward onto a router entry must not — the page
 * itself is the book there. Next's history sync leaves custom state on
 * native pushes intact. */
export const BOOK_MODAL_HISTORY_STATE = { bookModal: true };

export function isBookModalHistoryState(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { bookModal?: unknown }).bookModal === true
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
