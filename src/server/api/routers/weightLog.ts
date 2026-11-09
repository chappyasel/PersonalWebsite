import { TRPCError } from "@trpc/server";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { loadWeekRecords } from "~/lib/weight-log/database";
import {
  PHASE_KINDS,
  type PhaseKind,
  addDays,
  weekStartOf,
} from "~/lib/weight-log/phases";
import {
  MAX_POUNDS_PER_WEEK,
  MAX_TARGET,
  type PlanEdit,
  PlanEditError,
  type PlanState,
  isMonday,
  planEndMove,
  planRateChange,
  planStartPhase,
} from "~/lib/weight-log/plan-edits";
import { buildWeightLog } from "~/lib/weight-log/records";
import { buildWeekTable, currentPhase } from "~/lib/weight-log/week-table";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import type { db as database } from "~/server/db";
import {
  weightLogPhases,
  weightLogPlannedWeeks,
  weightLogSetPoints,
  weightLogWeighIns,
} from "~/server/db/schema";

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

const monday = z.iso.date().refine(isMonday, "Pick a Monday.");

const phaseId = z.string().regex(/^\d{1,9}$/, "No such phase.");

/** A target or set point, in pounds to one decimal place. */
const targetPounds = z
  .number()
  .positive()
  .max(MAX_TARGET)
  .transform((value) => Math.round(value * 10) / 10);

/** A weekly rate, in pounds to two decimal places, such as 0.25. */
const poundsPerWeek = z
  .number()
  .min(-MAX_POUNDS_PER_WEEK)
  .max(MAX_POUNDS_PER_WEEK)
  .transform((value) => Math.round(value * 100) / 100);

/** Plan edits wait on each other, so a double tap can't interleave two. */
const PLAN_LOCK = 0x574c50;

type Database = typeof database;

/**
 * Run one plan edit in one transaction: take the plan lock, read phases,
 * planned weeks, and the weeks that hold weigh-ins, ask the planner for the
 * rows to change, and write them. Weigh-ins are only read. A refused edit
 * writes nothing and reaches the page as its message.
 */
async function editPlan(
  db: Database,
  plan: (state: PlanState) => PlanEdit,
): Promise<{ newPhaseId: number | null }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${PLAN_LOCK})`);
      const phases = await tx.select().from(weightLogPhases);
      const weeks = await tx.select().from(weightLogPlannedWeeks);
      const weighIns = await tx
        .select({ date: weightLogWeighIns.date })
        .from(weightLogWeighIns);
      const edit = plan({
        phases: phases.map((phase) => ({
          ...phase,
          kind: phase.kind as PhaseKind,
        })),
        weeks,
        weighInWeeks: new Set(weighIns.map(({ date }) => weekStartOf(date))),
      });

      if (edit.deleteWeeks.length) {
        await tx
          .delete(weightLogPlannedWeeks)
          .where(inArray(weightLogPlannedWeeks.weekStart, edit.deleteWeeks));
      }
      if (edit.deletePhases.length) {
        await tx
          .delete(weightLogPhases)
          .where(inArray(weightLogPhases.id, edit.deletePhases));
      }
      for (const { id, endDate } of edit.endPhases) {
        await tx
          .update(weightLogPhases)
          .set({ endDate })
          .where(eq(weightLogPhases.id, id));
      }
      let newPhaseId: number | null = null;
      if (edit.newPhase) {
        const [row] = await tx
          .insert(weightLogPhases)
          .values({ ...edit.newPhase, endDate: null })
          .returning({ id: weightLogPhases.id });
        newPhaseId = row!.id;
      }
      if (edit.writeWeeks.length) {
        await tx
          .insert(weightLogPlannedWeeks)
          .values(
            edit.writeWeeks.map((week) => ({
              ...week,
              phaseId: week.phaseId ?? newPhaseId!,
            })),
          )
          .onConflictDoUpdate({
            target: weightLogPlannedWeeks.weekStart,
            set: {
              phaseId: sql`excluded.phase_id`,
              target: sql`excluded.target`,
              originalTarget: sql`excluded.original_target`,
            },
          });
      }
      return { newPhaseId };
    });
  } catch (error) {
    if (error instanceof PlanEditError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

/**
 * The owner's Weight Log: daily entry, corrections, and the weekly table.
 * Every procedure is on `ownerProcedure` (weightLogOwnerOnly.test.ts). The
 * public `/weight-log` page reads the tables directly and never calls these.
 */
export const weightLogRouter = createTRPCRouter({
  /**
   * Every phase for the picker, newest first. `currentId` is the latest
   * phase, and `runningId` is the one with no end date, whose plan the page
   * can extend or shorten.
   */
  phases: ownerProcedure.query(async ({ ctx }) => {
    const records = await loadWeekRecords(ctx.db);
    const log = buildWeightLog(records);
    const running = records.phases.find((phase) => phase.endDate === null);
    return {
      currentId: currentPhase(log.phases)?.id ?? null,
      runningId: running ? String(running.id) : null,
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

  /**
   * Start a phase (decisions 8, 9, 10, and 12). The current phase ends the
   * day before, its later weeks move to the new plan or go, and the new
   * weeks' original targets are their targets. `currentPhaseId` is the
   * phase the page showed as current; a mismatch refuses the edit.
   */
  startPhase: ownerProcedure
    .input(
      z.object({
        kind: z.enum(PHASE_KINDS),
        startDate: monday,
        startTarget: targetPounds,
        poundsPerWeek,
        lastWeek: monday,
        currentPhaseId: phaseId.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { newPhaseId } = await editPlan(ctx.db, (state) =>
        planStartPhase(state, {
          ...input,
          currentPhaseId:
            input.currentPhaseId === null ? null : Number(input.currentPhaseId),
        }),
      );
      return { phaseId: String(newPhaseId) };
    }),

  /** Change one week's lb/wk, moving every later target in its phase (decision 11). */
  changeRate: ownerProcedure
    .input(z.object({ weekStart: monday, poundsPerWeek }))
    .mutation(async ({ ctx, input }) => {
      await editPlan(ctx.db, (state) => planRateChange(state, input));
      return { weekStart: input.weekStart };
    }),

  /**
   * Move the running phase's last week (decision 11): later adds weeks at
   * the last rate with no original target, earlier removes weeks from the
   * end and refuses a week that holds weigh-ins.
   */
  moveEnd: ownerProcedure
    .input(z.object({ phaseId, lastWeek: monday }))
    .mutation(async ({ ctx, input }) => {
      await editPlan(ctx.db, (state) =>
        planEndMove(state, {
          phaseId: Number(input.phaseId),
          lastWeek: input.lastWeek,
        }),
      );
      return { lastWeek: input.lastWeek };
    }),

  /** The set points in order (decision 24). */
  setPoints: ownerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(weightLogSetPoints)
      .orderBy(asc(weightLogSetPoints.position));
    return rows.map((row) => row.pounds);
  }),

  /**
   * Replace the set points with this list, in order (decision 24). The chart
   * labels them by position, so the list is written whole.
   */
  saveSetPoints: ownerProcedure
    .input(z.object({ pounds: z.array(targetPounds).max(10) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.delete(weightLogSetPoints);
        if (input.pounds.length) {
          await tx.insert(weightLogSetPoints).values(
            input.pounds.map((pounds, index) => ({
              position: index + 1,
              pounds,
            })),
          );
        }
      });
      return input.pounds;
    }),
});
