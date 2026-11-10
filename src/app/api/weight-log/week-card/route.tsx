import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import { loadWeekRecords } from "~/lib/weight-log/database";
import { buildWeightLog } from "~/lib/weight-log/records";
import { weekSummary } from "~/lib/weight-log/week-summary";
import { parseCardDate } from "~/lib/weight-log/weigh-ins";
import { db } from "~/server/db";

import { NO_STORE_HEADERS, logFailure, refuseMethod, reply } from "../responses";
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

/**
 * Both Georgia Pro weights, read once per warm function. `next.config.js`
 * traces the two files into this route's bundle, so they come from disk, not
 * over HTTP. A failed read is forgotten so the next request tries again.
 */
let fonts: Promise<[ArrayBuffer, ArrayBuffer]> | undefined;

function loadFonts() {
  fonts ??= Promise.all([loadGeorgiaProRegular(), loadGeorgiaProBold()]).catch(
    (error: unknown) => {
      fonts = undefined;
      throw error;
    },
  );
  return fonts;
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

  // Satori's own errors happen while the body streams, after this returns,
  // so these catches see only the reads and the week's math. The render
  // tests guard the rest.
  let loaded: [
    Awaited<ReturnType<typeof loadWeekRecords>>,
    [ArrayBuffer, ArrayBuffer],
  ];
  try {
    loaded = await Promise.all([loadWeekRecords(db), loadFonts()]);
  } catch (error) {
    logFailure("week-card", "load", error);
    return couldNotDraw();
  }
  const [records, [regular, bold]] = loaded;
  let summary: ReturnType<typeof weekSummary>;
  try {
    summary = weekSummary(buildWeightLog(records), parsed.date);
  } catch (error) {
    logFailure("week-card", "build", error);
    return couldNotDraw();
  }
  return new ImageResponse(<WeekCard summary={summary} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: "Georgia Pro", data: regular, weight: 400, style: "normal" },
      { name: "Georgia Pro", data: bold, weight: 700, style: "normal" },
    ],
    // ImageResponse sets its own cache header first; these replace it.
    headers: NO_STORE_HEADERS,
  });
}

function couldNotDraw() {
  return reply({ error: "The week card could not be drawn." }, 500);
}

/** The card only reads. Every other method is refused. */
const readOnly = refuseMethod("GET, HEAD", "The week card only reads");

export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
export const OPTIONS = readOnly;
