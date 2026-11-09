import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { loadWeekRecords } from "~/lib/weight-log/database";
import { addDays } from "~/lib/weight-log/phases";
import { buildWeightLog } from "~/lib/weight-log/records";
import { buildWeekTable, currentPhase } from "~/lib/weight-log/week-table";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { weightLogWeighIns } from "~/server/db/schema";

/** The earliest date a weigh-in may carry. The log starts in 2018. */
const EARLIEST_DATE = "2000-01-01";

/**
 * The owner's local date can run one day ahead of UTC (up to UTC+14), so a
 * weigh-in may be dated tomorrow by the server's clock but no later.
 */
function latestDate(now = new Date()) {
  return addDays(now.toISOString().slice(0, 10), 1);
}

const weighInDate = z.iso
  .date()
  .refine((date) => date >= EARLIEST_DATE, "That date is too early.")
  .refine((date) => date <= latestDate(), "That date is in the future.");

/** Pounds to one decimal place (decision 22), within the table's check. */
const pounds = z
  .number()
  .positive()
  .max(1500)
  .transform((value) => Math.round(value * 10) / 10);

/**
 * The owner's Weight Log: daily entry, corrections, and the weekly table.
 * Every procedure is on `ownerProcedure` (weightLogOwnerOnly.test.ts). The
 * public `/weight-log` page reads the tables directly and never calls these.
 */
export const weightLogRouter = createTRPCRouter({
  /** Every phase for the picker, newest first, and the running one's id. */
  phases: ownerProcedure.query(async ({ ctx }) => {
    const log = buildWeightLog(await loadWeekRecords(ctx.db));
    return {
      currentId: currentPhase(log.phases)?.id ?? null,
      phases: [...log.phases].reverse().map(({ id, label, start, end }) => ({
        id,
        label,
        start,
        end,
      })),
    };
  }),

  /** One phase's weekly table (decision 23). */
  weekTable: ownerProcedure
    .input(z.object({ phaseId: z.string().max(32) }))
    .query(async ({ ctx, input: { phaseId } }) => {
      const log = buildWeightLog(await loadWeekRecords(ctx.db));
      if (!log.phases.some((phase) => phase.id === phaseId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such phase." });
      }
      return { phaseId, rows: buildWeekTable(log, phaseId) };
    }),

  /**
   * Record a date's weigh-in. A date has at most one (decision 7), so
   * entering a date that has one replaces its pounds. The excluded flag stays
   * as it was (decision 14). Drizzle's `$onUpdate` sets `updated_at`.
   */
  upsertWeighIn: ownerProcedure
    .input(z.object({ date: weighInDate, pounds }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(weightLogWeighIns)
        .values({ date: input.date, pounds: input.pounds })
        .onConflictDoUpdate({
          target: weightLogWeighIns.date,
          set: { pounds: input.pounds },
        })
        .returning({
          date: weightLogWeighIns.date,
          pounds: weightLogWeighIns.pounds,
        });
      return row!;
    }),

  /** Remove a date's weigh-in. Deleting a date with none is not an error. */
  deleteWeighIn: ownerProcedure
    .input(z.object({ date: z.iso.date() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(weightLogWeighIns)
        .where(eq(weightLogWeighIns.date, input.date))
        .returning({ date: weightLogWeighIns.date });
      return { deleted: deleted.length > 0 };
    }),
});
