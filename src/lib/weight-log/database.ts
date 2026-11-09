import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  weightLogBodyFatRecollections,
  weightLogPhases,
  weightLogPlannedWeeks,
  weightLogScans,
  weightLogSetPoints,
  weightLogStrengthHistory,
  weightLogWeighIns,
} from "~/server/db/schema";

import type { WeightLogRecords } from "./records";

/** Read every Weight Log table from one consistent snapshot, without writing. */
export async function loadWeightLogRecords<
  Schema extends Record<string, unknown>,
>(db: PostgresJsDatabase<Schema>): Promise<WeightLogRecords> {
  return db.transaction(
    async (tx) => ({
      weighIns: await tx.select().from(weightLogWeighIns),
      phases: await tx.select().from(weightLogPhases),
      plannedWeeks: await tx.select().from(weightLogPlannedWeeks),
      setPoints: await tx.select().from(weightLogSetPoints),
      scans: await tx.select().from(weightLogScans),
      recollections: await tx.select().from(weightLogBodyFatRecollections),
      strength: await tx.select().from(weightLogStrengthHistory),
    }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Read only what the owner's weekly table needs: weigh-ins, phases, and
 * planned weeks. The three reads run in parallel on separate connections, so
 * the page waits one round trip instead of three; the owner is the only
 * writer, so they see one state.
 */
export async function loadWeekRecords<Schema extends Record<string, unknown>>(
  db: PostgresJsDatabase<Schema>,
): Promise<WeightLogRecords> {
  const [weighIns, phases, plannedWeeks] = await Promise.all([
    db.select().from(weightLogWeighIns),
    db.select().from(weightLogPhases),
    db.select().from(weightLogPlannedWeeks),
  ]);
  return {
    weighIns,
    phases,
    plannedWeeks,
    setPoints: [],
    scans: [],
    recollections: [],
    strength: [],
  };
}
