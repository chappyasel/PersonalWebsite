import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import "server-only";

import {
  WEIGHTLIFTING_REVALIDATE,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import { db } from "~/server/db";

export type ChartSelectableExercise = {
  displayName: string;
  name: string;
  category: string;
  setCount: number;
  bestOneRM: number;
};

export const loadChartSelectableExercises = async (minSets: number) => {
  const rows = await db.transaction(async (transaction) => {
    // The aggregate scans all 48k sets and measures ~1.2s on Neon, so a
    // 1200ms cap was a coin flip that intermittently 404'd every exercise
    // page. Results are cached for 6h; a rare slow read beats an empty index.
    await transaction.execute(sql`SET LOCAL statement_timeout = '8000ms'`);
    return transaction.execute<{
      display_name: string;
      name: string;
      category: string;
      set_count: number;
      best_one_rm: number;
    }>(sql`
      SELECT
        CASE
          WHEN e.iteration IS NOT NULL AND e.iteration != ''
          THEN e.iteration || ' ' || e.name
          ELSE e.name
        END AS display_name,
        e.name,
        e.category,
        COUNT(s.id) AS set_count,
        MAX(s.one_rm) AS best_one_rm
      FROM wl_sets s
      INNER JOIN wl_exercises e ON s.exercise_id = e.id
      WHERE s.one_rm IS NOT NULL
        AND s.one_rm > 0
        AND e.style = 'reps_weight'
      GROUP BY display_name, e.name, e.category
      HAVING COUNT(s.id) >= ${minSets}
      ORDER BY best_one_rm DESC
    `);
  });

  return rows.map((row) => ({
    displayName: row.display_name,
    name: row.name,
    category: row.category,
    setCount: Number(row.set_count),
    bestOneRM: Number(row.best_one_rm),
  }));
};

export const getChartSelectableExercises = unstable_cache(
  loadChartSelectableExercises,
  ["wl-chart-selectable-exercises"],
  { revalidate: WEIGHTLIFTING_REVALIDATE, tags: [WEIGHTLIFTING_TAG] },
);
