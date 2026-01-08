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
 * @returns The path ("/")
 */
export function getBooksPath(): string {
  return "/";
}

/**
 * Generate the share URL for a book
 * @param bookId - The book ID
 * @returns The full share URL
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
  return `${protocol}//${hostname}${port}/${bookId}`;
}
