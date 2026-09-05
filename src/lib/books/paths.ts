/**
 * Generate the path for a book detail page
 * @param bookId - The book ID
 * @param queryParams - Optional query string (without leading ?)
 * @returns The path (e.g., "/{bookId}")
 */
export function getBookPath(bookId: string, queryParams?: string): string {
  const basePath = `/${bookId}`;
  return queryParams ? `${basePath}?${queryParams}` : basePath;
}

/**
 * Generate the path for the books grid page
 * @param queryParams - Optional query string (without leading ?)
 * @returns A directory-relative path that works on both /books/:id and /:id
 */
export function getBooksPath(queryParams?: string): string {
  return queryParams ? `./?${queryParams}` : ".";
}

/**
 * Query string for the books grid filtered to a single tag.
 *
 * Any tag selection already in `search` is replaced by this one tag; every
 * other parameter (size, sort, search text, the other facets) is kept, so a
 * tag pressed inside a book leaves the shelf looking the way it did, only
 * narrowed. The value is encoded the same way nuqs reads it back.
 * @param tag - The tag to filter by
 * @param search - The current query string, with or without a leading ?
 * @returns The query string (without leading ?)
 */
export function getBooksTagQuery(tag: string, search = ""): string {
  const query = new URLSearchParams(search);
  query.set("tags", tag);
  return query.toString();
}

/**
 * Generate the share URL for a book
 * @param bookId - The book ID
 * @returns The full share URL
 *
 * Book pages only resolve on the books subdomain, so when the modal is
 * embedded elsewhere (e.g. the chappyasel.com home page) the host is
 * prefixed with `books.`; on books.* hosts the URL is unchanged.
 */
export function getBookShareUrl(bookId: string): string {
  const hostname =
    typeof window !== "undefined"
      ? window.location.hostname
      : "books.chappyasel.com";
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";
  const port =
    typeof window !== "undefined" && window.location.port
      ? `:${window.location.port}`
      : "";
  const host = hostname.startsWith("books.")
    ? hostname
    : `books.${hostname.replace(/^www\./, "")}`;
  return `${protocol}//${host}${port}/${bookId}`;
}
