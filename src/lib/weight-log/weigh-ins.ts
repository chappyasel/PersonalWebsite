import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { weightLogWeighIns } from "~/server/db/schema";

import { addDays } from "./phases";
import { PLAN_LOCK } from "./plan-edits";

/**
 * Recording a weigh-in. A date holds at most one (decision 7). The owner page
 * replaces without asking, because its button already reads Replace. The
 * Log Weight Shortcut asks first: it saves with `replace: false`, and on
 * `exists` asks the owner before sending `replace: true`.
 */

/** What a save did. */
export type SaveStatus =
  /** The date had no weigh-in, and now has this one. */
  | "saved"
  /** The date has a different weigh-in, and `replace` was false. Nothing was written. */
  | "exists"
  /** The date's weigh-in now has these pounds. Its `excluded` flag is unchanged. */
  | "replaced"
  /** The date already had these pounds. Nothing was written. */
  | "unchanged";

export interface SaveResult {
  status: SaveStatus;
  /** The date's pounds before the save, or null when it had none. */
  previous: number | null;
}

export interface WeighIn {
  date: string;
  /** Already rounded to one decimal place. */
  pounds: number;
}

/**
 * Save a date's weigh-in in one transaction. It first takes the plan lock
 * shared: a plan edit decides which weeks it may delete from the weigh-ins it
 * reads, so a save waits for an edit in flight and can't land in a week that
 * edit removes. Then it locks the date's row, if there is one, and decides.
 * A replace writes only `pounds`, so the `excluded` flag stays as it was
 * (decision 14). Drizzle's `$onUpdate` sets `updated_at`.
 */
export async function saveWeighIn<Schema extends Record<string, unknown>>(
  db: PostgresJsDatabase<Schema>,
  { date, pounds, replace }: WeighIn & { replace: boolean },
): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${PLAN_LOCK})`);
    // A second pass runs only when another save inserted this date between
    // the read and the insert. The insert then did nothing, and the read
    // finds that save's row, since Postgres waited for it to commit.
    for (let pass = 0; pass < 2; pass++) {
      const [current] = await tx
        .select({ pounds: weightLogWeighIns.pounds })
        .from(weightLogWeighIns)
        .where(eq(weightLogWeighIns.date, date))
        .for("update");
      if (!current) {
        const inserted = await tx
          .insert(weightLogWeighIns)
          .values({ date, pounds })
          .onConflictDoNothing({ target: weightLogWeighIns.date })
          .returning({ date: weightLogWeighIns.date });
        if (inserted.length) return { status: "saved", previous: null };
        continue;
      }
      const previous = current.pounds;
      if (previous === pounds) return { status: "unchanged", previous };
      if (!replace) return { status: "exists", previous };
      await tx
        .update(weightLogWeighIns)
        .set({ pounds })
        .where(eq(weightLogWeighIns.date, date));
      return { status: "replaced", previous };
    }
    throw new Error("The weigh-in did not save. Try again.");
  });
}

const HOUR = 3_600_000;

/** The calendar date `hours` from `now`, as a clock at that UTC offset reads it. */
const dateAtOffset = (now: Date, hours: number) =>
  new Date(now.getTime() + hours * HOUR).toISOString().slice(0, 10);

/**
 * The dates the Log Weight Shortcut may write or read: a date that is today
 * or yesterday in some real time zone, from UTC−12 to UTC+14 (decision 38).
 * The earliest is yesterday in UTC−12 and the latest is today in UTC+14. The
 * Shortcut sends the phone's own date, so today and yesterday always fit
 * wherever the owner is, and a date that has not begun in any time zone
 * never does. The window holds three or four dates. Older corrections go through
 * `/weight-log/edit`.
 */
export function shortcutWindow(now = new Date()) {
  return {
    earliest: addDays(dateAtOffset(now, -12), -1),
    latest: dateAtOffset(now, 14),
  };
}

export function isInShortcutWindow(date: string, now = new Date()) {
  const { earliest, latest } = shortcutWindow(now);
  return date >= earliest && date <= latest;
}

export const OUTSIDE_SHORTCUT_WINDOW =
  "Only today's or yesterday's weigh-in can be sent here. Use /weight-log/edit for other dates.";

/**
 * Pounds as a number or as a numeric string, since a Shortcut's dictionary
 * field can send either, rounded to one decimal place (decision 22) before
 * the range check, as the owner page's are.
 */
const pounds = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .transform((value) => Math.round(value * 10) / 10)
  .pipe(z.number().positive().max(1500));

const replace = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ])
  .default(false);

const requestSchema = z.object({ date: z.iso.date(), pounds, replace });

export type WeighInRequest = WeighIn & { replace: boolean };

/**
 * Read the Shortcut's JSON body: `{ date, pounds, replace }`. The date must
 * be a real `YYYY-MM-DD` date inside the Shortcut's window.
 */
export function parseWeighInRequest(
  body: unknown,
  now = new Date(),
): { weighIn: WeighInRequest } | { error: string } {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error:
        field === "date"
          ? "date must be a date written YYYY-MM-DD"
          : field === "pounds"
            ? "pounds must be a number above 0 and at most 1500"
            : field === "replace"
              ? "replace must be true or false"
              : "Send a JSON object with date, pounds, and replace",
    };
  }
  if (!isInShortcutWindow(parsed.data.date, now)) {
    return { error: OUTSIDE_SHORTCUT_WINDOW };
  }
  return { weighIn: parsed.data };
}

/** Read the card's `?date=`: a real date inside the Shortcut's window. */
export function parseCardDate(
  value: string | null,
  now = new Date(),
): { date: string } | { error: string } {
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success)
    return { error: "date must be a date written YYYY-MM-DD" };
  if (!isInShortcutWindow(parsed.data, now)) {
    return {
      error:
        "Only this week's card for today or yesterday can be read here. Use /weight-log/edit for other weeks.",
    };
  }
  return { date: parsed.data };
}
