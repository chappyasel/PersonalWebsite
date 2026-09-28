import { type NextRequest, NextResponse, after } from "next/server";

import { refreshBookCachesAfterSync } from "~/lib/books/cacheInvalidation";
import { syncBooksFromNotion, withBookSyncLock } from "~/lib/books/sync";

import { env } from "~/env";

export const maxDuration = 800;

/**
 * Verifies the authorization header matches the CRON_SECRET
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Runs the sync and cache refresh (shared between GET and POST)
 */
async function runSync(source: "cron" | "manual") {
  console.log(`${source} triggered: syncing books from Notion...`);
  const result = await withBookSyncLock(() =>
    syncBooksFromNotion(source, async (bookIds) => {
      await refreshBookCachesAfterSync(
        {
          bookIdsToInvalidate: bookIds,
          bookIdsToWarm: [],
        },
        source,
      );
    }),
  );
  const cacheRefresh = await refreshBookCachesAfterSync(result, source);
  return { result, cacheRefresh };
}

/**
 * Vercel Cron endpoint for syncing books from Notion
 * Called daily at 9:00 AM UTC
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel automatically adds this)
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, ...(await runSync("cron")) });
  } catch (error) {
    console.error("Cron sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Webhook endpoint for syncing books from Notion
 * Can be called from Notion buttons or other webhook sources
 *
 * Notion abandons a webhook after a few seconds and reports "webhook request
 * timed out", while a sync takes a minute or more. Answer at once and sync
 * after the response; the function keeps running up to maxDuration.
 */
export function POST(request: NextRequest) {
  // Verify webhook secret
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      const { cacheRefresh } = await runSync("manual");
      console.log("Webhook sync finished; cache refresh:", cacheRefresh);
    } catch (error) {
      console.error("Webhook sync failed:", error);
    }
  });

  return NextResponse.json(
    { success: true, status: "started" },
    { status: 202 },
  );
}
