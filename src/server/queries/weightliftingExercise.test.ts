import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { expect, it, vi } from "vitest";

import { loadParetoAttempts } from "~/lib/weightlifting/pareto/database";
import { db } from "~/server/db";

import { getCachedExerciseDetail } from "./weightliftingExercise";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("./weightliftingExercises", () => ({
  getChartSelectableExercises: vi.fn(),
  loadChartSelectableExercises: vi.fn(),
}));

it.skipIf(!process.env.WEIGHTLIFTING_TEST_DATABASE_URL)(
  "combines every variant without merging separate occurrences or duplicating sets",
  async () => {
    const client = postgres(process.env.WEIGHTLIFTING_TEST_DATABASE_URL!, {
      max: 1,
    });
    try {
      await client.begin(
        "isolation level repeatable read read only",
        async (tx) => {
          mocks.transaction.mockImplementation(
            async (run: (adapter: unknown) => Promise<unknown>) =>
              run({
                execute: async (query: SQL) => {
                  const compiled = new PgDialect().sqlToQuery(query);
                  return tx.unsafe(
                    compiled.sql,
                    compiled.params as (string | number)[],
                  );
                },
              }),
          );
          const [exercise] = await tx`
          SELECT name FROM wl_exercises WHERE style = 'reps_weight'
          GROUP BY name HAVING COUNT(DISTINCT COALESCE(iteration, '')) > 1
          ORDER BY COUNT(*) DESC LIMIT 1
        `;
          expect(exercise).toBeTruthy();
          const name = exercise!.name as string;
          const variants = await tx`
          SELECT DISTINCT CASE WHEN COALESCE(iteration, '') = '' THEN name
          ELSE iteration || ' ' || name END AS display_name
          FROM wl_exercises WHERE name = ${name}
        `;
          const individual = await Promise.all(
            variants.map((v) =>
              getCachedExerciseDetail(v.display_name as string),
            ),
          );
          const combined = await getCachedExerciseDetail(name, true);
          expect(combined).not.toBeNull();
          expect(combined!.instanceCount).toBe(
            individual.reduce((n, v) => n + v!.instanceCount, 0),
          );
          expect(combined!.totalSets).toBe(
            individual.reduce((n, v) => n + v!.totalSets, 0),
          );
          expect(combined!.instances).toHaveLength(combined!.instanceCount);
          expect(
            combined!.instances.reduce((n, v) => n + v.sets.length, 0),
          ).toBe(combined!.totalSets);
          expect(
            new Set(combined!.instances.map((v) => v.displayName)),
          ).toEqual(new Set(variants.map((v) => String(v.display_name))));
          expect(combined!.best?.oneRM).toBe(
            Math.max(...individual.map((v) => v!.best?.oneRM ?? 0)),
          );
          const attempts = await loadParetoAttempts(db, name, true);
          const [count] = await tx`
          SELECT COUNT(*) AS n FROM wl_sets s JOIN wl_exercises e ON e.id = s.exercise_id
          WHERE e.name = ${name} AND e.style = 'reps_weight' AND s.one_rm > 0
        `;
          expect(attempts.attempts).toHaveLength(Number(count!.n));
        },
      );
    } finally {
      await client.end();
    }
  },
);
