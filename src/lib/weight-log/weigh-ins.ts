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

/**
 * The dates the Log Weight Shortcut may write or read: the server's UTC date
 * and one day either side. The Shortcut sends the phone's own date (decision
 * 22), which is never more than a day from UTC's, so today always fits.
 * Yesterday fits until UTC midnight passes, which is 4 or 5 PM in Pacific
 * time. Older corrections go through `/weight-log/edit`.
 */
export function entryWindow(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return { earliest: addDays(today, -1), latest: addDays(today, 1) };
}

export function isInEntryWindow(date: string, now = new Date()) {
  const { earliest, latest } = entryWindow(now);
  return date >= earliest && date <= latest;
}

export const OUTSIDE_ENTRY_WINDOW =
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

const entrySchema = z.object({ date: z.iso.date(), pounds, replace });

export type WeighInEntry = WeighIn & { replace: boolean };

/**
 * Read the Shortcut's JSON body: `{ date, pounds, replace }`. The date must
 * be a real `YYYY-MM-DD` date inside the entry window.
 */
export function parseWeighInEntry(
  body: unknown,
  now = new Date(),
): { entry: WeighInEntry } | { error: string } {
  const parsed = entrySchema.safeParse(body);
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
  if (!isInEntryWindow(parsed.data.date, now)) {
    return { error: OUTSIDE_ENTRY_WINDOW };
  }
  return { entry: parsed.data };
}

/** Read the card's `?date=`: a real date inside the entry window. */
export function parseCardDate(
  value: string | null,
  now = new Date(),
): { date: string } | { error: string } {
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success)
    return { error: "date must be a date written YYYY-MM-DD" };
  if (!isInEntryWindow(parsed.data, now)) {
    return {
      error:
        "Only this week's card for today or yesterday can be read here. Use /weight-log/edit for other weeks.",
    };
  }
  return { date: parsed.data };
}
