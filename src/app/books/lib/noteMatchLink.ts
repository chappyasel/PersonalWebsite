import { SEARCH_HIGHLIGHT_PARAM } from "~/lib/books/searchHighlight";

/**
 * Where a "Mentioned in Notes" match opens its book: the shelf's own query
 * string (so closing the book returns to the same shelf), the search to
 * mark there (`?hl=`, from the shelf's `q`), and the chapter or takeaway the
 * passage came from (`#anchor`). A row's click and the keyboard's Enter
 * both open this address.
 */
export function noteMatchHref(
  bookPath: (bookId: string, query?: string) => string,
  bookId: string,
  search: string,
  anchor: string | null,
): string {
  const params = new URLSearchParams(search);
  const query = params.get("q")?.trim();
  if (query) params.set(SEARCH_HIGHLIGHT_PARAM, query);
  return `${bookPath(bookId, params.toString())}${
    anchor ? `#${encodeURIComponent(anchor)}` : ""
  }`;
}
