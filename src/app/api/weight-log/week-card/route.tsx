import {
  NO_STORE_HEADERS,
  logFailure,
  refuseMethod,
  reply,
} from "../responses";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import { loadWeekRecords } from "~/lib/weight-log/database";
import { buildWeightLog } from "~/lib/weight-log/records";
import { weekCard } from "~/lib/weight-log/week-card";
import { parseCardDate } from "~/lib/weight-log/weigh-ins";
import { db } from "~/server/db";

import { WEIGHT, WeekCardImage, cardSize } from "./WeekCard";
import { env } from "~/env";

/**
 * The week card the Log Weight Shortcut shows in its notification: a
 * portrait PNG of the week holding `?date=YYYY-MM-DD` and the two before
 * it, day by day with that day marked as today, over the weekly table's
 * summary for up to five weeks before and three after. It answers the same `WEIGHT_LOG_ENTRY_TOKEN` as `/api/weight-log/weigh-in`,
 * only for a date in the Shortcut's window, and never writes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The editor's SF Pro Display in the card's three weights (`WEIGHT`), read
 * once per warm function. `next.config.js` traces the files into this
 * route's bundle, so they come from disk, not over HTTP. A failed read is forgotten so the
 * next request tries again. `scripts/generate/weight-log-card-fonts.py`
 * makes them, with tabular figures built in.
 */
type Fonts = [ArrayBuffer, ArrayBuffer, ArrayBuffer];
let fonts: Promise<Fonts> | undefined;

const readFont = async (name: string) =>
  new Uint8Array(
    await readFile(join(process.cwd(), "src/fonts/weight-log", name)),
  ).buffer;

function loadFonts() {
  fonts ??= Promise.all([
    readFont("SF-Pro-Display-Regular.otf"),
    readFont("SF-Pro-Display-Medium.otf"),
    readFont("SF-Pro-Display-Bold.otf"),
  ]).catch((error: unknown) => {
    fonts = undefined;
    throw error;
  });
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
  let loaded: [Awaited<ReturnType<typeof loadWeekRecords>>, Fonts];
  try {
    loaded = await Promise.all([loadWeekRecords(db), loadFonts()]);
  } catch (error) {
    logFailure("week-card", "load", error);
    return couldNotDraw();
  }
  const [records, [regular, medium, bold]] = loaded;
  let card: ReturnType<typeof weekCard>;
  try {
    const running = records.phases.find((phase) => phase.endDate === null);
    card = weekCard(
      buildWeightLog(records),
      parsed.date,
      running ? String(running.id) : null,
    );
  } catch (error) {
    logFailure("week-card", "build", error);
    return couldNotDraw();
  }
  const style = "normal";
  return new ImageResponse(<WeekCardImage card={card} />, {
    ...cardSize(card),
    fonts: [
      { name: "SF Pro Display", data: regular, weight: WEIGHT.number, style },
      { name: "SF Pro Display", data: medium, weight: WEIGHT.current, style },
      { name: "SF Pro Display", data: bold, weight: WEIGHT.label, style },
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
