import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
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
  PLAN_LOCK,
  type PlanEdit,
  PlanEditError,
  type PlanState,
  STALE_PLAN,
  isMonday,
  planEndMove,
  planRateChange,
  planRevision,
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

/**
 * Pounds to one decimal place (decision 22), checked after rounding, since
 * 0.01 is positive but rounds to 0.
 */
const tenthsOfAPound = (max: number) =>
  z
    .number()
    .transform((value) => Math.round(value * 10) / 10)
    .pipe(z.number().positive().max(max));

/** A weigh-in, within the table's check. */
const pounds = tenthsOfAPound(1500);

const monday = z.iso.date().refine(isMonday, "Pick a Monday.");

const phaseId = z.string().regex(/^\d{1,9}$/, "No such phase.");

/** A target or set point, in pounds to one decimal place. */
const targetPounds = tenthsOfAPound(MAX_TARGET);

/** The `planRevision` of the plan the page showed when the owner edited it. */
const revision = z.string().max(32);

/** A weekly rate, in pounds to two decimal places, such as 0.25. */
const poundsPerWeek = z
  .number()
  .min(-MAX_POUNDS_PER_WEEK)
  .max(MAX_POUNDS_PER_WEEK)
  .transform((value) => Math.round(value * 100) / 100);

type Database = typeof database;

/**
 * Run one plan edit in one transaction: take the plan lock, read phases,
 * planned weeks, and the weeks that hold weigh-ins, check that the plan is
 * still the one the page showed, ask the planner for the rows to change, and
 * write them. Weigh-ins are only read. A refused edit writes nothing and
 * reaches the page as its message.
 */
async function editPlan(
  db: Database,
  expected: string,
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
      // Another tab may have changed the plan since this page loaded it.
      // Phase ids alone don't catch every case: a rate change or a new end
      // keeps the ids and moves the targets.
      if (planRevision({ phases, weeks }) !== expected) {
        throw new PlanEditError(STALE_PLAN, "CONFLICT");
      }
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
   * can extend or shorten. `revision` goes back with a plan edit, which the
   * server refuses if the plan has changed since.
   */
  phases: ownerProcedure.query(async ({ ctx }) => {
    const records = await loadWeekRecords(ctx.db);
    const log = buildWeightLog(records);
    const running = records.phases.find((phase) => phase.endDate === null);
    return {
      currentId: currentPhase(log.phases)?.id ?? null,
      runningId: running ? String(running.id) : null,
      revision: planRevision({
        phases: records.phases,
        weeks: records.plannedWeeks,
      }),
      phases: [...log.phases].reverse().map(({ id, label, start, end }) => ({
        id,
        label,
        start,
        end,
      })),
    };
  }),

  /**
   * One phase's weekly table (decision 23), with the revision of the plan
   * its targets came from.
   */
  weekTable: ownerProcedure
    .input(z.object({ phaseId: z.string().max(32) }))
    .query(async ({ ctx, input: { phaseId } }) => {
      const records = await loadWeekRecords(ctx.db);
      const log = buildWeightLog(records);
      if (!log.phases.some((phase) => phase.id === phaseId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such phase." });
      }
      return {
        phaseId,
        rows: buildWeekTable(log, phaseId),
        revision: planRevision({
          phases: records.phases,
          weeks: records.plannedWeeks,
        }),
      };
    }),

  /**
   * One calendar week's weigh-ins, Monday to Sunday, for the editor's
   * correction grid. It reads by date, not by phase, so a weigh-in no phase
   * holds (one dated before the first phase starts) can still be replaced or
   * deleted from the page.
   */
  week: ownerProcedure
    .input(
      z.object({
        week: z.iso
          .date()
          .refine((date) => weekStartOf(date) === date, "Not a Monday."),
      }),
    )
    .query(async ({ ctx, input: { week } }) => {
      const rows = await ctx.db
        .select({
          date: weightLogWeighIns.date,
          pounds: weightLogWeighIns.pounds,
          excluded: weightLogWeighIns.excluded,
        })
        .from(weightLogWeighIns)
        .where(
          and(
            gte(weightLogWeighIns.date, week),
            lte(weightLogWeighIns.date, addDays(week, 6)),
          ),
        );
      const byDate = new Map(rows.map((row) => [row.date, row]));
      const days = Array.from({ length: 7 }, (_, day) =>
        byDate.get(addDays(week, day)),
      );
      return {
        week,
        weights: days.map((day) => day?.pounds ?? null),
        excludedDays: days.flatMap((day, index) =>
          day?.excluded ? [index] : [],
        ),
      };
    }),

  /**
   * Record a date's weigh-in. A date has at most one (decision 7), so
   * entering a date that has one replaces its pounds. The excluded flag stays
   * as it was (decision 14). Drizzle's `$onUpdate` sets `updated_at`.
   */
  upsertWeighIn: ownerProcedure
    .input(z.object({ date: weighInDate, pounds }))
    .mutation(({ ctx, input }) =>
      // A plan edit decides which weeks it may delete from the weigh-ins it
      // reads. The shared plan lock makes a save wait for an edit in flight,
      // so a new weigh-in can't land in a week that edit removes.
      ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock_shared(${PLAN_LOCK})`,
        );
        const [row] = await tx
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
    ),

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
        revision,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { newPhaseId } = await editPlan(ctx.db, input.revision, (state) =>
        planStartPhase(state, {
          ...input,
          currentPhaseId:
            input.currentPhaseId === null ? null : Number(input.currentPhaseId),
        }),
      );
      return { phaseId: String(newPhaseId) };
    }),

  /**
   * Change one week's lb/wk, moving every later target in its phase
   * (decision 11). `phaseId` is the phase the page showed the week in.
   */
  changeRate: ownerProcedure
    .input(z.object({ phaseId, weekStart: monday, poundsPerWeek, revision }))
    .mutation(async ({ ctx, input }) => {
      await editPlan(ctx.db, input.revision, (state) =>
        planRateChange(state, {
          phaseId: Number(input.phaseId),
          weekStart: input.weekStart,
          poundsPerWeek: input.poundsPerWeek,
        }),
      );
      return { weekStart: input.weekStart };
    }),

  /**
   * Move the running phase's last week (decision 11): later adds weeks at
   * the last rate with no original target, earlier removes weeks from the
   * end and refuses a week that holds weigh-ins.
   */
  moveEnd: ownerProcedure
    .input(z.object({ phaseId, lastWeek: monday, revision }))
    .mutation(async ({ ctx, input }) => {
      await editPlan(ctx.db, input.revision, (state) =>
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
   * labels them by position, so the list is written whole. `previous` is the
   * list the page started from. Saves take the plan lock, so two at once run
   * in turn, and the second finds the list changed and is refused.
   */
  saveSetPoints: ownerProcedure
    .input(
      z.object({
        pounds: z.array(targetPounds).max(10),
        previous: z.array(z.number()).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${PLAN_LOCK})`);
        const current = await tx
          .select()
          .from(weightLogSetPoints)
          .orderBy(asc(weightLogSetPoints.position));
        if (
          current.length !== input.previous.length ||
          current.some((row, index) => row.pounds !== input.previous[index])
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The set points changed since this page loaded them. Cancel to see them, then edit again.",
          });
        }
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
