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
