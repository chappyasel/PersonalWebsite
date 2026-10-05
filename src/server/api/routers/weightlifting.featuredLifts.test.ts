import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { weightliftingRouter } from "~/server/api/routers/weightlifting";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { allVariantsSlug } from "~/server/queries/exerciseDirectory";
import type * as WeightliftingExercise from "~/server/queries/weightliftingExercise";

import { BASE_NAME_LIFTS } from "~/app/weightlifting/lib/featuredLifts";
import { DEFAULT_EXERCISES } from "~/app/weightlifting/lib/searchParams";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  index: vi.fn(),
  selectable: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("~/lib/weightlifting/s3", () => ({ getWldLastModified: vi.fn() }));
vi.mock("~/lib/weightlifting/sync", () => ({ syncWeightlifting: vi.fn() }));
vi.mock("~/server/queries/weightlifting", () => ({
  getCachedActivityMosaic: vi.fn(),
  getCachedWeightliftingStats: vi.fn(),
}));
vi.mock("~/server/queries/weightliftingPareto", () => ({
  getCachedWeightliftingPareto: vi.fn(),
}));
vi.mock("~/server/queries/weightliftingExercise", async (importOriginal) => ({
  // Keeps the real DISPLAY_NAME_SQL the router's queries are built from
  ...(await importOriginal<typeof WeightliftingExercise>()),
  getCachedExerciseIndex: mocks.index,
  getFreshExerciseIndex: mocks.index,
}));
vi.mock("~/server/queries/weightliftingExercises", () => ({
  getChartSelectableExercises: mocks.selectable,
}));

const caller = createCallerFactory(
  createTRPCRouter({ weightlifting: weightliftingRouter }),
)({ db: {} as never, session: null, headers: new Headers() }).weightlifting;

const compiled = (call: number) =>
  new PgDialect().sqlToQuery(mocks.execute.mock.calls[call]![0] as SQL);

// postgres-js returns NUMERIC and SUM columns as strings
const recordRow = (
  display_name: string,
  best_one_rm: string,
  instance_count: string,
  whole = false,
) => ({
  display_name,
  whole,
  category: "Legs",
  best_one_rm,
  best_reps: "3",
  best_weight: "500",
  instance_count,
});

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
beforeEach(() => {
  mocks.index.mockResolvedValue([
    { displayName: "Sumo Deadlifts", slug: "sumo-deadlifts" },
    { displayName: "Back Squats", slug: "back-squats" },
  ]);
});
afterEach(() => {
  mocks.execute.mockReset();
  mocks.index.mockReset();
  mocks.selectable.mockReset();
});

it("links a base-name lift's record to its all-variations page", async () => {
  mocks.execute.mockResolvedValueOnce([
    recordRow("Back Squats", "600.5", "120"),
    recordRow("Sumo Deadlifts", "535", "60"),
    recordRow("Deadlifts", "580", "150", true),
  ]);

  const records = await caller.getPersonalRecords();

  expect(records.map((r) => [r.exerciseName, r.slug])).toEqual([
    ["Back Squats", "back-squats"],
    ["Sumo Deadlifts", "sumo-deadlifts"],
    ["Deadlifts", allVariantsSlug("Deadlifts")],
  ]);
  expect(records.at(-1)).toEqual({
    exerciseName: "Deadlifts",
    category: "Legs",
    bestOneRM: 580,
    reps: 3,
    weight: 500,
    instanceCount: 150,
    slug: allVariantsSlug("Deadlifts"),
  });
  expect(records[0]!.bestOneRM).toBe(600.5);

  // One statement, so every record comes from the same data generation
  expect(mocks.execute).toHaveBeenCalledOnce();
  const query = compiled(0);
  expect(query.params).toEqual(BASE_NAME_LIFTS);
  expect(query.sql).toContain("CROSS JOIN LATERAL");
  expect(query.sql).toContain("DISTINCT ON (lift.name)");
  expect(query.sql).toContain("e.name IN ($1)");
  expect(query.sql).toContain("counts AS MATERIALIZED");
});

it("keeps the Deadlifts link when the exercise index is down", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.index.mockRejectedValue(new Error("index unavailable"));
  mocks.execute.mockResolvedValueOnce([
    recordRow("Sumo Deadlifts", "535", "60"),
    recordRow("Deadlifts", "580", "150", true),
  ]);

  const records = await caller.getPersonalRecords();

  expect(records.map((r) => [r.exerciseName, r.slug])).toEqual([
    ["Sumo Deadlifts", null],
    ["Deadlifts", allVariantsSlug("Deadlifts")],
  ]);
  expect(error).toHaveBeenCalledOnce();
  error.mockRestore();
});

it("charts a base-name lift and its variations from one query", async () => {
  mocks.execute.mockResolvedValueOnce([
    { date: "2026-01-02", exercise: "Deadlifts", best_one_rm: "580" },
    { date: "2026-01-02", exercise: "Sumo Deadlifts", best_one_rm: "535.5" },
  ]);

  const progression = await caller.getStrengthProgression({
    exercises: ["Deadlifts", "Sumo Deadlifts"],
  });

  expect(progression).toEqual([
    { date: "2026-01-02", exercise: "Deadlifts", bestOneRM: 580 },
    { date: "2026-01-02", exercise: "Sumo Deadlifts", bestOneRM: 535.5 },
  ]);
  const query = compiled(0);
  // Base-name list feeds the lateral VALUES, then the requested lifts
  expect(query.params).toEqual([
    ...BASE_NAME_LIFTS,
    "Deadlifts",
    "Sumo Deadlifts",
  ]);
  expect(query.sql).toMatch(
    /CASE WHEN e\.name IN \(\$1\) THEN e\.name END, true\)\s*\) AS lift\(name, whole\)/,
  );
  expect(query.sql).toContain("lift.name IN ($2, $3)");
  // The day string, not w.date, so two workouts on one day share a row
  expect(query.sql).toContain("GROUP BY 1, lift.name");
});

it("rejects empty and oversized exercise names before querying", async () => {
  await expect(
    caller.getStrengthProgression({ exercises: [""] }),
  ).rejects.toThrow();
  await expect(
    caller.getStrengthProgression({ exercises: ["x".repeat(512)] }),
  ).rejects.toThrow();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("builds the picker's Deadlifts entry from every variation, rare ones included", async () => {
  mocks.selectable.mockResolvedValue([
    {
      displayName: "Trap Bar Deadlifts",
      name: "Deadlifts",
      category: "Legs",
      setCount: 5,
      bestOneRM: 600,
    },
    {
      displayName: "Conventional Deadlifts",
      name: "Deadlifts",
      category: "Back",
      setCount: 250,
      bestOneRM: 580,
    },
    {
      displayName: "Sumo Deadlifts",
      name: "Deadlifts",
      category: "Legs",
      setCount: 200,
      bestOneRM: 535,
    },
  ]);

  const exercises = await caller.getTopExercises({ minSets: 25 });

  // Every row is loaded; the threshold applies here, per variation
  expect(mocks.selectable).toHaveBeenCalledWith(1);
  expect(exercises.map((e) => e.displayName)).toEqual([
    "Deadlifts",
    "Conventional Deadlifts",
    "Sumo Deadlifts",
  ]);
  expect(exercises[0]).toEqual({
    displayName: "Deadlifts",
    name: "Deadlifts",
    category: "Back",
    setCount: 455,
    bestOneRM: 600,
  });
});

it("defaults to twelve featured lifts with Deadlifts in place of its variations", async () => {
  expect(DEFAULT_EXERCISES).toHaveLength(12);
  expect(DEFAULT_EXERCISES).toEqual(expect.arrayContaining(BASE_NAME_LIFTS));
  expect(
    DEFAULT_EXERCISES.filter((name) => name.endsWith("Deadlifts")),
  ).toEqual(["Deadlifts"]);

  // The dashboard prefetches the defaults; the input caps a request at 20
  mocks.execute.mockResolvedValueOnce([]);
  await expect(
    caller.getStrengthProgression({ exercises: DEFAULT_EXERCISES }),
  ).resolves.toEqual([]);
});

it.skipIf(!process.env.WEIGHTLIFTING_TEST_DATABASE_URL)(
  "ranks and charts a base-name lift from every variation in Postgres",
  async () => {
    const lift = BASE_NAME_LIFTS[0];
    const client = postgres(process.env.WEIGHTLIFTING_TEST_DATABASE_URL!, {
      max: 1,
    });
    try {
      await client.begin(
        "isolation level repeatable read read only",
        async (tx) => {
          mocks.execute.mockImplementation(async (query: SQL) => {
            const { sql, params } = new PgDialect().sqlToQuery(query);
            return tx.unsafe(sql, params as (string | number)[]);
          });
          mocks.index.mockResolvedValue([]);

          const [truth] = await tx`
            SELECT
              (SELECT MAX(s.one_rm) FROM wl_sets s
               JOIN wl_exercises e ON e.id = s.exercise_id
               WHERE e.name = ${lift} AND s.one_rm > 0) AS best,
              (SELECT COUNT(*) FROM wl_exercises
               WHERE name = ${lift}) AS instances
          `;
          const [variation] = await tx`
            SELECT iteration || ' ' || name AS display_name, COUNT(*) AS n
            FROM wl_exercises
            WHERE name = ${lift} AND COALESCE(iteration, '') <> ''
            GROUP BY 1 ORDER BY 2 DESC LIMIT 1
          `;
          const variationName = variation!.display_name as string;

          const records = await caller.getPersonalRecords();
          const names = records.map((r) => r.exerciseName);
          expect(new Set(names).size).toBe(names.length);
          expect(records.find((r) => r.exerciseName === lift)).toMatchObject({
            bestOneRM: Number(truth!.best),
            instanceCount: Number(truth!.instances),
            slug: allVariantsSlug(lift),
          });
          expect(
            records.find((r) => r.exerciseName === variationName)
              ?.instanceCount,
          ).toBe(Number(variation!.n));

          const progression = await caller.getStrengthProgression({
            exercises: [lift, variationName],
          });
          const keys = progression.map((p) => `${p.date} ${p.exercise}`);
          expect(new Set(keys).size).toBe(keys.length);
          const days = await tx`
            SELECT TO_CHAR(w.date, 'YYYY-MM-DD') AS date, MAX(s.one_rm) AS best
            FROM wl_sets s
            JOIN wl_exercises e ON e.id = s.exercise_id
            JOIN wl_workouts w ON w.id = e.workout_id
            WHERE e.name = ${lift} AND e.style = 'reps_weight' AND s.one_rm > 0
            GROUP BY 1
          `;
          const liftByDay = new Map(
            progression
              .filter((p) => p.exercise === lift)
              .map((p) => [p.date, p.bestOneRM]),
          );
          expect(liftByDay.size).toBe(days.length);
          for (const day of days) {
            expect(liftByDay.get(day.date as string)).toBe(Number(day.best));
          }
        },
      );
    } finally {
      await client.end();
    }
  },
  60_000,
);
