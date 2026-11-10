import type { NextRequest } from "next/server";

import { isBearerAuthorized } from "~/lib/weight-log/bearer";
import {
  mirrorWeighInsQuery,
  parseMirrorRange,
  toMirrorWeighIns,
} from "~/lib/weight-log/mirror";
import { db } from "~/server/db";

import { refuseMethod, reply } from "../responses";
import { env } from "~/env";

/**
 * The read the owner's Apple Health Shortcuts make: weigh-ins, date and
 * pounds only, for `?from=YYYY-MM-DD&to=YYYY-MM-DD`. `Health Daily Sync` asks
 * for the last 14 days each morning and `Weight Backfill` for one year per
 * run. Each logs a Weight sample for every date Health does not have yet.
 *
 * It answers only `Authorization: Bearer <WEIGHT_LOG_MIRROR_TOKEN>`, a token
 * used for nothing else, and refuses everything while that is unset. It
 * accepts no writes. See `~/Desktop/Agents/apple-health/shortcut/` for the
 * Shortcuts.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!env.WEIGHT_LOG_MIRROR_TOKEN) {
    return reply({ error: "The Health mirror is not configured" }, 503);
  }
  if (
    !isBearerAuthorized(
      request.headers.get("authorization"),
      env.WEIGHT_LOG_MIRROR_TOKEN,
    )
  ) {
    return reply({ error: "Unauthorized" }, 401, {
      "WWW-Authenticate": "Bearer",
    });
  }

  const parsed = parseMirrorRange(request.nextUrl.searchParams);
  if ("error" in parsed) return reply({ error: parsed.error }, 400);

  const rows = await mirrorWeighInsQuery(db, parsed.range);
  return reply({ weighIns: toMirrorWeighIns(rows, parsed.range) });
}

/** The mirror only reads. Every other method is refused. */
const readOnly = refuseMethod("GET, HEAD", "The Health mirror only reads");

export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
export const OPTIONS = readOnly;
