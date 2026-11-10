import { PLAN_LOCK } from "../../src/lib/weight-log/plan-edits";
import {
  weightLogBodyFatRecollections,
  weightLogPhases,
  weightLogPlannedWeeks,
  weightLogScans,
  weightLogSetPoints,
  weightLogStrengthHistory,
  weightLogWeighIns,
} from "../../src/server/db/schema";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  type ImportPlan,
  findSiteEntries,
  replaceRefusal,
} from "./import-plan";

const TABLES = [
  weightLogPlannedWeeks,
  weightLogPhases,
  weightLogWeighIns,
  weightLogSetPoints,
  weightLogScans,
  weightLogBodyFatRecollections,
  weightLogStrengthHistory,
];

type Database = Pick<PostgresJsDatabase, "transaction">;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ImportOptions {
  replace: boolean;
  discardSiteEntries: boolean;
  dryRun: boolean;
}

function chunks<T>(rows: T[], size = 500) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

/** Refuse unless the tables are empty or may be replaced. True when rows exist. */
async function checkExisting(
  tx: Transaction,
  plan: ImportPlan,
  options: ImportOptions,
) {
  const existing = await tx.execute<{ rows: number }>(sql`
    SELECT (SELECT COUNT(*) FROM weight_log_weigh_ins)
      + (SELECT COUNT(*) FROM weight_log_phases)
      + (SELECT COUNT(*) FROM weight_log_scans)
      + (SELECT COUNT(*) FROM weight_log_set_points)
      + (SELECT COUNT(*) FROM weight_log_body_fat_recollections)
      + (SELECT COUNT(*) FROM weight_log_strength_history) AS rows
  `);
  if (!(Number(existing[0]?.rows) > 0)) return false;
  if (!options.replace)
    throw new Error(
      "Refusing to import: the Weight Log tables already hold data. Pass --replace to overwrite them.",
    );
  const siteEntries = findSiteEntries(
    await tx
      .select({
        date: weightLogWeighIns.date,
        pounds: weightLogWeighIns.pounds,
      })
      .from(weightLogWeighIns),
    plan.weighIns,
  );
  const refusal = replaceRefusal(siteEntries, options.discardSiteEntries);
  if (refusal) throw new Error(refusal);
  if (siteEntries.length)
    console.log(
      `Discarding ${siteEntries.length} weigh-in${siteEntries.length === 1 ? "" : "s"} the workbook lacks or records differently: ${siteEntries.join(", ")}.`,
    );
  return true;
}

/**
 * Write the plan in one transaction, or with `dryRun` run every check in a
 * read-only transaction and write nothing. Returns whether rows existed, so
 * `--replace` deleted (or would delete) them.
 */
export async function writeImport(
  db: Database,
  plan: ImportPlan,
  options: ImportOptions,
) {
  if (options.dryRun)
    return db.transaction((tx) => checkExisting(tx, plan, options), {
      accessMode: "read only",
    });

  return db.transaction(async (tx) => {
    // Plan and set point edits from /weight-log/edit take this lock first and
    // then lock phase and planned-week rows. Taking it here before any table
    // lock makes the import wait for an edit in progress, and an edit wait
    // for the import, so neither holds rows the other needs (a deadlock).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${PLAN_LOCK})`);
    // The site-entry check below reads the weigh-ins and --replace then
    // deletes them. EXCLUSIVE mode makes a save from /weight-log/edit wait
    // until this transaction ends, so none can land in between and be lost.
    // Reads still run. A read-only transaction may not take this lock, and
    // the dry run writes nothing, so it does without.
    await tx.execute(sql`LOCK TABLE weight_log_weigh_ins IN EXCLUSIVE MODE`);
    const replacing = await checkExisting(tx, plan, options);
    if (replacing) {
      for (const table of TABLES) await tx.delete(table);
      console.log("Replaced the existing Weight Log rows.");
    }

    const phaseIds = new Map<string, number>();
    for (const phase of plan.phases) {
      const [row] = await tx
        .insert(weightLogPhases)
        .values({
          kind: phase.kind,
          startDate: phase.startDate,
          endDate: phase.endDate,
        })
        .returning({ id: weightLogPhases.id });
      phaseIds.set(phase.startDate, row!.id);
    }
    for (const rows of chunks(plan.plannedWeeks))
      await tx.insert(weightLogPlannedWeeks).values(
        rows.map((week) => ({
          weekStart: week.weekStart,
          phaseId: phaseIds.get(week.phaseStart)!,
          target: week.target,
          originalTarget: week.originalTarget,
        })),
      );
    for (const rows of chunks(plan.weighIns))
      await tx.insert(weightLogWeighIns).values(rows);
    if (plan.setPoints.length)
      await tx.insert(weightLogSetPoints).values(plan.setPoints);
    if (plan.scans.length) await tx.insert(weightLogScans).values(plan.scans);
    await tx.insert(weightLogBodyFatRecollections).values(plan.recollection);
    for (const rows of chunks(plan.strength))
      await tx.insert(weightLogStrengthHistory).values(rows);
    return replacing;
  });
}
