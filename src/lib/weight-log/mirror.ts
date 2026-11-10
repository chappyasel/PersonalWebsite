import { and, asc, gte, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { weightLogWeighIns } from "~/server/db/schema";

/**
 * The Apple Health mirror: the owner's iPhone Shortcut reads weigh-ins here
 * and logs each one into Health as a Weight sample. The read is one way and
 * read-only; nothing the phone sends is stored.
 */

/** The longest range one request may ask for, in days, both ends included. */
export const MIRROR_MAX_DAYS = 366;

/** An inclusive range of calendar dates, each `YYYY-MM-DD`. */
export interface MirrorRange {
  from: string;
  to: string;
}

/** The only fields the mirror sends: the date and the reading. */
export interface MirrorWeighIn {
  date: string;
  pounds: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds since the epoch for a real `YYYY-MM-DD` date, else null. */
function dayValue(value: string | null): number | null {
  const match = DATE.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  // Date.UTC rolls 2026-02-30 over to March; a real date survives the trip.
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? time
    : null;
}

/**
 * Read `from` and `to` from a request's query. Both are required, both must
 * be real dates, `from` may not be after `to`, and the range may cover at
 * most MIRROR_MAX_DAYS days. The backfill asks for one calendar year at a
 * time, which is 366 days in a leap year.
 */
export function parseMirrorRange(
  params: URLSearchParams,
): { range: MirrorRange } | { error: string } {
  const from = params.get("from");
  const to = params.get("to");
  const start = dayValue(from);
  const end = dayValue(to);
  if (start === null || end === null) {
    return { error: "from and to must be dates written YYYY-MM-DD" };
  }
  if (start > end) return { error: "from must not be after to" };
  const days = (end - start) / 86_400_000 + 1;
  if (days > MIRROR_MAX_DAYS) {
    return { error: `ask for at most ${MIRROR_MAX_DAYS} days at a time` };
  }
  return { range: { from: from!, to: to! } };
}

/**
 * Keep only the weigh-ins inside the range, with only their date and pounds,
 * oldest first. The query already filters by range; this is the one place
 * the response's shape is decided, so a wider read can never widen it.
 * Excluded weigh-ins are kept: exclusion only leaves a reading out of its
 * week's average, and the reading itself is real.
 */
export function toMirrorWeighIns(
  rows: readonly { date: string; pounds: number }[],
  range: MirrorRange,
): MirrorWeighIn[] {
  return rows
    .filter((row) => row.date >= range.from && row.date <= range.to)
    .map((row) => ({ date: row.date, pounds: row.pounds }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Select the range's weigh-ins, date and pounds only. Never writes. */
export function mirrorWeighInsQuery<Schema extends Record<string, unknown>>(
  db: PostgresJsDatabase<Schema>,
  range: MirrorRange,
) {
  return db
    .select({ date: weightLogWeighIns.date, pounds: weightLogWeighIns.pounds })
    .from(weightLogWeighIns)
    .where(
      and(
        gte(weightLogWeighIns.date, range.from),
        lte(weightLogWeighIns.date, range.to),
      ),
    )
    .orderBy(asc(weightLogWeighIns.date));
}
