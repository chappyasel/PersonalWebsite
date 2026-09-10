import { revalidatePath, revalidateTag } from "next/cache";
import "server-only";

import { BOOKS_DATA_TAG } from "~/server/queries/books";

import type { SyncResult } from "./sync";
import { env } from "~/env";

const BOOKS_PRODUCTION_ORIGIN = "https://books.chappyasel.com";
const HOMEPAGE_PRODUCTION_ORIGIN = "https://www.chappyasel.com";

export type BookCacheRefreshResult = {
  attempted: boolean;
  invalidated: number;
  warmed: number;
  warmFailures: string[];
  error?: string;
};

/** Invalidate route output in the domain handling the current request. */
export function invalidateBookCachePaths(
  bookIds: string[],
  refreshCollection = true,
): void {
  revalidateTag(BOOKS_DATA_TAG, "max");

  if (refreshCollection) {
    revalidatePath("/");
    revalidatePath("/books");
  }

  for (const bookId of bookIds) {
    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/opengraph-image`);
    revalidatePath(`/books/${bookId}/icon`);
  }
}

/**
 * Refresh caches after a successful Notion sync.
 *
 * Vercel scopes on-demand ISR invalidation by domain. Production therefore
 * asks the canonical homepage and books domains to invalidate their routes.
 * Only the books domain warms book images. The homepage's canonical www host
 * avoids a redirect that would strip the authorization header.
 * Local/preview environments invalidate in-process.
 */
export async function refreshBookCachesAfterSync(
  result: Pick<SyncResult, "bookIdsToInvalidate" | "bookIdsToWarm">,
  source: "cron" | "manual",
): Promise<BookCacheRefreshResult> {
  const shouldRefresh =
    result.bookIdsToInvalidate.length > 0 || source === "manual";

  // The main-domain homepage also contains book data.
  if (shouldRefresh) {
    revalidateTag(BOOKS_DATA_TAG, "max");
    revalidatePath("/");
    revalidatePath("/books");
  }

  if (!shouldRefresh) {
    return {
      attempted: false,
      invalidated: 0,
      warmed: 0,
      warmFailures: [],
    };
  }

  if (process.env.VERCEL_ENV !== "production") {
    invalidateBookCachePaths(result.bookIdsToInvalidate);
    return {
      attempted: true,
      invalidated: result.bookIdsToInvalidate.length,
      warmed: 0,
      warmFailures: [],
    };
  }

  try {
    const responses = await Promise.allSettled(
      [HOMEPAGE_PRODUCTION_ORIGIN, BOOKS_PRODUCTION_ORIGIN].map(
        async (origin) => {
          const response = await fetch(`${origin}/api/revalidate-book-caches`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${env.CRON_SECRET}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              bookIdsToInvalidate: result.bookIdsToInvalidate,
              bookIdsToWarm:
                origin === BOOKS_PRODUCTION_ORIGIN ? result.bookIdsToWarm : [],
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(120_000),
          });
          if (!response.ok) {
            throw new Error(
              `${origin} cache endpoint returned ${response.status}`,
            );
          }
          return (await response.json()) as BookCacheRefreshResult;
        },
      ),
    );
    for (const response of responses) {
      if (response.status === "rejected") throw response.reason;
    }
    const booksResponse = responses[1]!;
    if (booksResponse.status === "rejected") throw booksResponse.reason;
    return booksResponse.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Book cache refresh failed: ${message}`);
    return {
      attempted: true,
      invalidated: 0,
      warmed: 0,
      warmFailures: result.bookIdsToWarm,
      error: message,
    };
  }
}
