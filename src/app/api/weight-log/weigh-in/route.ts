import type { NextRequest } from "next/server";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import { loadWeekRecords } from "~/lib/weight-log/database";
import { buildWeightLog } from "~/lib/weight-log/records";
import {
  type WeekSummary,
  saveSummary,
  weekSummary,
} from "~/lib/weight-log/week-summary";
import { parseWeighInRequest, saveWeighIn } from "~/lib/weight-log/weigh-ins";
import { db } from "~/server/db";

import { logFailure, refuseMethod, reply } from "../responses";
import { env } from "~/env";

/**
 * The owner's Log Weight Shortcut records today's weigh-in here. It posts
 * `{ date, pounds, replace }` with the phone's own date and gets back JSON
 * with `status` (`saved`, `exists`, `replaced`, or `unchanged`), `previous`,
 * and `summary`, the notification line. On `exists` nothing was written, and
 * `question` is the Replace prompt; the Shortcut posts again with
 * `replace: true` if the owner taps Replace.
 *
 * It answers only `Authorization: Bearer <WEIGHT_LOG_ENTRY_TOKEN>`, a token
 * used for nothing but this route and the week card, and refuses everything
 * while that is unset. It writes only dates in the Shortcut's window (today or
 * yesterday in some time zone) and never deletes. See "Entry from a Shortcut" in
 * `docs/weight-log.md`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
    ...saveSummary({ ...weighIn, ...saved }, week),
  });
}

/** The route only records a weigh-in. Every other method is refused. */
const postOnly = refuseMethod("POST", "Weigh-ins are recorded with POST");

export const GET = postOnly;
export const PUT = postOnly;
export const PATCH = postOnly;
export const DELETE = postOnly;
export const OPTIONS = postOnly;
