import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  type BookCacheRefreshResult,
  invalidateBookCachePaths,
} from "~/lib/books/cacheInvalidation";

import { env } from "~/env";

export const maxDuration = 180;
const WARM_CONCURRENCY = 8;

const requestSchema = z.object({
  bookIdsToInvalidate: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(500),
  bookIdsToWarm: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(500),
});

async function warmBookImages(bookIds: string[], requestUrl: string) {
  const origin = new URL(requestUrl).origin;
  const failures: string[] = [];

  for (let index = 0; index < bookIds.length; index += WARM_CONCURRENCY) {
    const batch = bookIds.slice(index, index + WARM_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (bookId) => {
        const response = await fetch(`${origin}/${bookId}/opengraph-image`, {
          headers: {
            "user-agent": "Book-Sync-OG-Warmer/1.0",
            pragma: "no-cache",
          },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${bookId}`);
        }
      }),
    );

    for (const [resultIndex, result] of results.entries()) {
      if (result.status === "rejected") {
        failures.push(batch[resultIndex]!);
      }
    }
  }

  return failures;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { bookIdsToInvalidate, bookIdsToWarm } = parsed.data;
  invalidateBookCachePaths(bookIdsToInvalidate);

  const warmFailures = await warmBookImages(bookIdsToWarm, request.url);
  const result: BookCacheRefreshResult = {
    attempted: true,
    invalidated: bookIdsToInvalidate.length,
    warmed: bookIdsToWarm.length - warmFailures.length,
    warmFailures,
  };

  if (warmFailures.length > 0) {
    console.warn(
      `Failed to warm ${warmFailures.length} book OG image(s): ${warmFailures.join(", ")}`,
    );
  }

  return NextResponse.json(result);
}
