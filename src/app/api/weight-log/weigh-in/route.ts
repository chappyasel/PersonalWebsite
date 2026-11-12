import type { NextRequest } from "next/server";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import { loadWeekRecords } from "~/lib/weight-log/database";
import { buildWeightLog } from "~/lib/weight-log/records";
import {
  type WeekSummary,
  ownerToday,
  saveSummary,
  weekSummary,
} from "~/lib/weight-log/week-summary";
import {
  type WeighIn,
  lastCountedWeighInBefore,
  parseLastWeighInDate,
  parseWeighInRequest,
  saveWeighIn,
} from "~/lib/weight-log/weigh-ins";
import { db } from "~/server/db";

import { logFailure, refuseMethod, reply } from "../responses";
import { env } from "~/env";

/**
 * The owner's Log Weight Shortcut records today's weigh-in here. It posts
 * `{ date, pounds, replace }` with the phone's own date and gets back JSON
 * with `status` (`saved`, `exists`, `replaced`, or `unchanged`), `previous`,
 * `title`, the outcome in a few characters ("✓ 221.0"), and `summary`, the
 * week in one line ("Avg 221.0 · 4.0 under target"), which every 200 carries
 * because the first Shortcut reads it. On `exists` nothing was written, and
 * `question` is the Replace prompt; the Shortcut posts again with
 * `replace: true` if the owner taps Replace.
 *
 * Before it asks, the Shortcut reads `GET ?date=YYYY-MM-DD` with the phone's
 * date, and gets back `{ date, pounds }`, the latest counted weigh-in before
 * that date, which fills the prompt. Both are null when there is none.
 *
 * It answers only `Authorization: Bearer <WEIGHT_LOG_ENTRY_TOKEN>`, a token
 * used for nothing but this route and the week card, and refuses everything
 * while that is unset. It reads and writes only dates in the Shortcut's window
 * (today or yesterday in some time zone) and never deletes. See "Entry from a
 * Shortcut" in `docs/weight-log.md`.
 */
export const dynamic = "force-dynamic";

/** The token check both methods make first: a refusal, or null to go on. */
function refuseToken(request: NextRequest) {
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
  return null;
}

export async function GET(request: NextRequest) {
  const refused = refuseToken(request);
  if (refused) return refused;

  const parsed = parseLastWeighInDate(request.nextUrl.searchParams.get("date"));
  if ("error" in parsed) return reply({ error: parsed.error }, 400);

  let last: WeighIn | null;
  try {
    last = await lastCountedWeighInBefore(db, parsed.date);
  } catch (error) {
    logFailure("weigh-in", "last", error);
    return reply({ error: "The last weigh-in could not be read." }, 500);
  }
  return reply(last ?? { date: null, pounds: null });
}

export async function POST(request: NextRequest) {
  const refused = refuseToken(request);
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(
      { error: "Send a JSON object with date, pounds, and replace" },
      400,
    );
  }
  const parsed = parseWeighInRequest(body);
  if ("error" in parsed) return reply({ error: parsed.error }, 400);
  const { weighIn } = parsed;

  let saved: Awaited<ReturnType<typeof saveWeighIn>>;
  try {
    saved = await saveWeighIn(db, weighIn);
  } catch (error) {
    logFailure("weigh-in", "save", error);
    return reply({ error: "The weigh-in didn't save. Try again." }, 500);
  }
  // The weigh-in is saved by now, so a failed read only costs the week line.
  let week: WeekSummary | null = null;
  try {
    week = weekSummary(buildWeightLog(await loadWeekRecords(db)), weighIn.date);
  } catch (error) {
    logFailure("weigh-in", "week", error);
  }
  // Every expected outcome is a 200, so the Shortcut branches on `status`.
  return reply({
    status: saved.status,
    date: weighIn.date,
    pounds: weighIn.pounds,
    previous: saved.previous,
    ...saveSummary({ ...weighIn, ...saved }, week, ownerToday()),
  });
}

/**
 * The route reads the last weigh-in and records one. Every other method is
 * refused.
 */
const readOrRecord = refuseMethod(
  "GET, HEAD, POST",
  "Weigh-ins are read with GET and recorded with POST",
);

export const PUT = readOrRecord;
export const PATCH = readOrRecord;
export const DELETE = readOrRecord;
export const OPTIONS = readOrRecord;
