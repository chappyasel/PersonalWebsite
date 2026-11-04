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

/** Where a book opens when a link names a passage: the words to mark there
 * (`?hl=`) and the chapter or takeaway to scroll to (`#anchor`). */
export type BookArrival = { highlight: string | null; anchor: string | null };

/** A book's address with its arrival added. Any query it has is kept. */
export function withBookArrival(href: string, arrival?: BookArrival): string {
  if (!arrival) return href;
  const [address = "", hash] = href.split("#", 2);
  const [path = "", search = ""] = address.split("?", 2);
  const params = new URLSearchParams(search);
  if (arrival.highlight) params.set(SEARCH_HIGHLIGHT_PARAM, arrival.highlight);
  const query = params.toString();
  const anchor = arrival.anchor ? encodeURIComponent(arrival.anchor) : hash;
  return `${path}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`;
}
