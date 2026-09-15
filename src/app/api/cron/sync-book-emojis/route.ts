import { type NextRequest, NextResponse } from "next/server";

import { syncBookEmojis } from "~/server/bookCoverEmojis/cloud";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // On by default. Set this to stop the daily run without waiting for a
  // deploy, which is what you want at the moment you need it.
  if (process.env.BOOK_COVER_EMOJIS_DISABLED === "true") {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }
  try {
    const result = await syncBookEmojis();
    return NextResponse.json({ success: result.failed.length === 0, ...result });
  } catch {
    // Provider errors may contain signed cover URLs or credentials.
    return NextResponse.json(
      { success: false, error: "Book emoji sync failed" },
      { status: 500 },
    );
  }
}
