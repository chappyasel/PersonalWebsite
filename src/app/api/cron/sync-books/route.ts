import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

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

  // Purge cached book pages when anything changed so additions, edits, and
  // deletions show up immediately instead of after the 24h ISR window.
  // Manual syncs always revalidate: they're a human asking for fresh state,
  // and the ISR cache persists across deployments on Vercel.
  const changes = result.booksAdded + result.booksUpdated + result.booksDeleted;
  if (changes > 0 || source === "manual") {
    console.log(`${changes} book(s) changed — revalidating /books pages`);
    revalidatePath("/books", "layout");
  }

  return NextResponse.json({
    success: true,
    result,
  });
}

/**
 * Vercel Cron endpoint for syncing books from Notion
 * Called daily at 6:00 AM UTC
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
