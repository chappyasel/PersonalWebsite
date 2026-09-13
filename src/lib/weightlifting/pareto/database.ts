import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Attempt } from "./analysis";

/** Never select only PRs, session maxima, or observations above the display floor. */
export async function loadParetoAttempts<
  Schema extends Record<string, unknown>,
>(db: PostgresJsDatabase<Schema>, displayName: string) {
  return db.transaction(
    async (tx) => {
      const rows = await tx.execute<Attempt>(sql`
      SELECT TO_CHAR(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        s.weight, s.reps, s.one_rm AS "oneRM"
      FROM wl_sets s JOIN wl_exercises e ON e.id = s.exercise_id
      JOIN wl_workouts w ON w.id = e.workout_id
      WHERE e.style = 'reps_weight' AND s.one_rm > 0
        AND CASE WHEN COALESCE(e.iteration, '') = '' THEN e.name
          ELSE e.iteration || ' ' || e.name END = ${displayName}
      ORDER BY w.date, e.exercise_order, s.set_order, s.id
    `);
      const sync = await tx.execute<{ date: string | null }>(sql`
      SELECT MAX(sync_completed_at)::text AS date FROM wl_sync_metadata WHERE status = 'success'
    `);
      return {
        attempts: [...rows],
        liftingSyncedAt: sync[0]?.date
          ? new Date(sync[0].date).toISOString()
          : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Discover every exercise variation carrying recorded 1RMe, without a curated allowlist. */
export async function loadParetoExerciseNames<
  Schema extends Record<string, unknown>,
>(db: PostgresJsDatabase<Schema>) {
  const rows = await db.execute<{ displayName: string }>(sql`
    SELECT DISTINCT CASE WHEN COALESCE(e.iteration, '') = '' THEN e.name
      ELSE e.iteration || ' ' || e.name END AS "displayName"
    FROM wl_sets s JOIN wl_exercises e ON e.id = s.exercise_id
    WHERE e.style = 'reps_weight' AND s.one_rm > 0
    ORDER BY "displayName"
  `);
  return rows.map((row) => row.displayName);
}
