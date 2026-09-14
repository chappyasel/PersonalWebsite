import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterEach, expect, it, vi } from "vitest";

import { getCachedLatestWorkout } from "./latestWorkout";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: { execute: mocks.execute } }));
afterEach(() => vi.resetAllMocks());

it("returns no card data for an empty workout library", async () => {
  mocks.execute.mockResolvedValue([]);
  expect(await getCachedLatestWorkout()).toBeNull();
});
it("normalizes aggregates and unnamed sessions without inventing a duration", async () => {
  mocks.execute.mockResolvedValue([
    {
      uuid: "session",
      name: " ",
      date: "2026-09-13",
      duration_seconds: null,
      set_count: "12",
      volume: "10500",
      categories: ["Chest"],
      exercises: [],
      supersets: [],
    },
  ]);
  expect(await getCachedLatestWorkout()).toEqual({
    uuid: "session",
    name: "Workout",
    date: "2026-09-13",
    durationSeconds: null,
    setCount: 12,
    volume: 10500,
    categories: ["Chest"],
    exercises: [],
    supersets: [],
  });
});

// Opt-in, read-only check against the real import. No application writes.
it.skipIf(!process.env.WEIGHTLIFTING_TEST_DATABASE_URL)(
  "matches the newest session and independently counted sets in PostgreSQL",
  async () => {
    const client = postgres(process.env.WEIGHTLIFTING_TEST_DATABASE_URL!, {
      max: 1,
    });
    try {
      await client.begin("read only", async (tx) => {
        mocks.execute.mockImplementation(async (query: SQL) => {
          const { sql, params } = new PgDialect().sqlToQuery(query);
          expect(params).toHaveLength(0);
          return tx.unsafe(sql);
        });
        const actual = await getCachedLatestWorkout();
        const [latest] = await tx<{ id: number; uuid: string; date: string }[]>`
          SELECT id, uuid, to_char(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date
          FROM wl_workouts ORDER BY date DESC, uuid DESC LIMIT 1
        `;
        if (!latest) {
          expect(actual).toBeNull();
          return;
        }
        expect(actual?.uuid).toBe(latest.uuid);
        expect(actual?.date).toBe(latest.date);
        const [totals] = await tx`
          SELECT COUNT(*) AS count, COALESCE(SUM(volume), 0) AS volume FROM wl_sets
          WHERE exercise_id IN (SELECT id FROM wl_exercises WHERE workout_id = ${latest.id})
        `;
        expect(actual?.setCount).toBe(Number(totals?.count));
        expect(actual?.volume).toBeCloseTo(Number(totals?.volume), 5);
        expect(
          actual?.exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
        ).toBe(actual?.setCount);
        expect(
          actual?.exercises.reduce(
            (sum, ex) =>
              sum +
              ex.sets.reduce((volume, set) => volume + (set.volume ?? 0), 0),
            0,
          ),
        ).toBeCloseTo(actual!.volume, 5);
        const orders = actual!.exercises.map((ex) => ex.order);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
      });
    } finally {
      await client.end();
    }
  },
);
