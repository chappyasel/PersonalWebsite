/**
 * Generate the correct path for a book detail page
 * @param bookId - The book ID
 * @param isSubdomain - Whether we're on the books subdomain
 * @param queryParams - Optional query string (without leading ?)
 * @returns The correct path (e.g., "/${bookId}" or "/books/${bookId}")
 */
export function getBookPath(
  bookId: string,
  isSubdomain: boolean,
  queryParams?: string,
): string {
  const basePath = isSubdomain ? `/${bookId}` : `/books/${bookId}`;
  return queryParams ? `${basePath}?${queryParams}` : basePath;
}

/**
 * Generate the correct path for the books grid page
 * @param isSubdomain - Whether we're on the books subdomain
 * @returns The correct path (e.g., "/" or "/books")
 */
export function getBooksPath(isSubdomain: boolean): string {
  return isSubdomain ? "/" : "/books";
}

/**
 * Generate the correct share URL for a book
 * @param bookId - The book ID
 * @param isSubdomain - Whether we're on the books subdomain
 * @returns The full share URL (uses subdomain if accessed from subdomain)
 */
export function getBookShareUrl(bookId: string, isSubdomain: boolean): string {
  if (isSubdomain) {
    // If on subdomain, use subdomain URL format
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
  } else {
    // If on main domain, use main domain URL format
    return `${typeof window !== "undefined" ? window.location.origin : "https://chappyasel.com"}/books/${bookId}`;
  }
}
