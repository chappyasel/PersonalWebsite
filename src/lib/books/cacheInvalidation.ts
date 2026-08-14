import { revalidatePath, revalidateTag } from "next/cache";
import "server-only";

import { BOOKS_DATA_TAG } from "~/server/queries/books";

import type { SyncResult } from "./sync";
import { env } from "~/env";

const BOOKS_PRODUCTION_ORIGIN = "https://books.chappyasel.com";

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
 * asks a protected endpoint on books.chappyasel.com to invalidate and warm the
 * public book routes. Local/preview environments invalidate in-process.
 */
export async function refreshBookCachesAfterSync(
  result: SyncResult,
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
    const response = await fetch(
      `${BOOKS_PRODUCTION_ORIGIN}/api/revalidate-book-caches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CRON_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bookIdsToInvalidate: result.bookIdsToInvalidate,
          bookIdsToWarm: result.bookIdsToWarm,
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Book cache endpoint returned ${response.status}`);
    }

    return (await response.json()) as BookCacheRefreshResult;
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
