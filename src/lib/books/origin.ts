import { devSubdomainUrl } from "~/lib/util";

/** The host where book pages resolve; every `/:bookId/...` path is relative to it. */
export const BOOKS_PRODUCTION_ORIGIN = "https://books.chappyasel.com";

/**
 * Origin for absolute book URLs: production's books host, or the
 * `books.localhost` dev host that the proxy rewrites the same way.
 */
export function getBooksOrigin(): string {
  return process.env.NODE_ENV === "production"
    ? BOOKS_PRODUCTION_ORIGIN
    : devSubdomainUrl("books");
}
