import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import { loadWeekRecords } from "~/lib/weight-log/database";
import { buildWeightLog } from "~/lib/weight-log/records";
import { weekSummary } from "~/lib/weight-log/week-summary";
import { parseCardDate } from "~/lib/weight-log/weigh-ins";
import { db } from "~/server/db";

import { CARD_HEIGHT, CARD_WIDTH, WeekCard } from "./WeekCard";
import {
  loadGeorgiaProBold,
  loadGeorgiaProRegular,
} from "~/app/books/[bookId]/fonts";
import { env } from "~/env";

/**
 * The week card the Log Weight Shortcut shows in its notification: a PNG of
 * the week holding `?date=YYYY-MM-DD`, with that day marked as today. It
 * answers the same `WEIGHT_LOG_ENTRY_TOKEN` as `/api/weight-log/weigh-in`,
 * only for a date in the Shortcut's window, and never writes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: unknown, status: number, extra: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...HEADERS, ...extra },
  });
}

export async function GET(request: NextRequest) {
  if (!env.WEIGHT_LOG_ENTRY_TOKEN) {
    return reply({ error: "Weigh-in entry is not configured" }, 503);
  }
  if (
    !isBearerAuthorized(
      request.headers.get("authorization"),
      env.WEIGHT_LOG_ENTRY_TOKEN,
    )
  ) {
    return reply({ error: "Unauthorized" }, 401, {
      "WWW-Authenticate": "Bearer",
    });
  }

  const parsed = parseCardDate(request.nextUrl.searchParams.get("date"));
  if ("error" in parsed) return reply({ error: parsed.error }, 400);

  const [records, regular, bold] = await Promise.all([
    loadWeekRecords(db),
    loadGeorgiaProRegular(),
    loadGeorgiaProBold(),
  ]);
  const summary = weekSummary(buildWeightLog(records), parsed.date);
  return new ImageResponse(<WeekCard summary={summary} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: "Georgia Pro", data: regular, weight: 400, style: "normal" },
      { name: "Georgia Pro", data: bold, weight: 700, style: "normal" },
    ],
    // ImageResponse sets its own cache header first; these replace it.
    headers: HEADERS,
  });
}

/** The card only reads. Every other method is refused. */
function readOnly() {
  return reply({ error: "The week card only reads" }, 405, {
    Allow: "GET, HEAD",
  });
}

export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
