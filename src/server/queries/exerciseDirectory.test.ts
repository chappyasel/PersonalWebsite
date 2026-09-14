import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  allVariantsSlug,
  exerciseHistorySlug,
  getCachedExerciseDirectory,
  getCachedExerciseOccurrences,
} from "./exerciseDirectory";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), index: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("./weightliftingExercise", () => ({
  getCachedExerciseIndex: mocks.index,
  getFreshExerciseIndex: mocks.index,
}));
beforeEach(() => mocks.index.mockResolvedValue([]));
afterEach(() => vi.resetAllMocks());

it("keeps all exercise styles and low-count exercises even when their charts are unavailable", async () => {
  mocks.index.mockRejectedValue(new Error("Charts unavailable"));
  mocks.execute.mockResolvedValue([
    {
      display_name: "Walking",
      name: "Walking",
      style: "duration",
      category: "Cardio",
      instance_count: "1",
      last_performed: "2026-09-13T10:00",
    },
  ]);
  expect(await getCachedExerciseDirectory()).toEqual([
    {
      displayName: "Walking",
      name: "Walking",
      style: "duration",
      allVariantsSlug: allVariantsSlug("Walking"),
      category: "Cardio",
      instanceCount: 1,
      lastPerformed: "2026-09-13T10:00",
      slug: exerciseHistorySlug("Walking"),
    },
  ]);
});
it("pages occurrences with a lookahead row and stable workout links", async () => {
  mocks.execute.mockResolvedValue(
    Array.from({ length: 11 }, (_, i) => ({
      workout_uuid: `workout-${i}`,
      workout_name: "Workout",
      ts: "2026-09-13T10:00",
      exercise_order: 2,
      style: "duration",
      sets: [],
    })),
  );
  const result = await getCachedExerciseOccurrences("Walking", 10);
  expect(result.hasMore).toBe(true);
  expect(result.instances).toHaveLength(10);
  expect(result.instances[0]).toMatchObject({
    workoutUuid: "workout-0",
    order: 2,
    style: "duration",
  });
  const query = new PgDialect().sqlToQuery(
    mocks.execute.mock.calls[0]![0] as SQL,
  );
  expect(query.params).toEqual(["Walking", 10]);
});

it.skipIf(!process.env.WEIGHTLIFTING_TEST_DATABASE_URL)(
  "matches all logged occurrences and their set counts in PostgreSQL",
  async () => {
    const client = postgres(process.env.WEIGHTLIFTING_TEST_DATABASE_URL!, {
      max: 1,
    });
    try {
      await client.begin("read only", async (tx) => {
        mocks.execute.mockImplementation(async (query: SQL) => {
          const compiled = new PgDialect().sqlToQuery(query);
          return tx.unsafe(
            compiled.sql,
            compiled.params as (string | number)[],
          );
        });
        const directory = await getCachedExerciseDirectory();
        const [total] = await tx`SELECT COUNT(*) AS count FROM wl_exercises`;
        expect(directory.reduce((count, e) => count + e.instanceCount, 0)).toBe(
          Number(total?.count),
        );
        const sample = directory[0];
        if (!sample) return;
        const history = await getCachedExerciseOccurrences(
          sample.displayName,
          0,
        );
        expect(history.instances[0]?.ts).toBe(sample.lastPerformed);
        expect(history.hasMore).toBe(sample.instanceCount > 10);
        for (const instance of history.instances) {
          const [count] = await tx`
          SELECT COUNT(s.id) AS count FROM wl_exercises e
          JOIN wl_workouts w ON w.id = e.workout_id
          LEFT JOIN wl_sets s ON s.exercise_id = e.id
          WHERE w.uuid = ${instance.workoutUuid} AND e.exercise_order = ${instance.order}
        `;
          expect(instance.sets).toHaveLength(Number(count?.count));
        }
      });
    } finally {
      await client.end();
    }
  },
);
