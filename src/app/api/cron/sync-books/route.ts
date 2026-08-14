import { type NextRequest, NextResponse } from "next/server";

import { refreshBookCachesAfterSync } from "~/lib/books/cacheInvalidation";
import { syncBooksFromNotion } from "~/lib/books/sync";

import { env } from "~/env";

export const maxDuration = 180;

/**
 * Verifies the authorization header matches the CRON_SECRET
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Handles the sync operation (shared between GET and POST)
 */
async function handleSync(source: "cron" | "manual") {
  console.log(`${source} triggered: syncing books from Notion...`);
  const result = await syncBooksFromNotion(source);
  const cacheRefresh = await refreshBookCachesAfterSync(result, source);

  return NextResponse.json({
    success: true,
    result,
    cacheRefresh,
  });
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
    return await handleSync("cron");
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
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await handleSync("manual");
  } catch (error) {
    console.error("Webhook sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
