import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, expect, it, vi } from "vitest";

import { getCachedActivityMosaic } from "./weightlifting";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/server/db", () => ({ db: { execute: mocks.execute } }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("queries the current twelve calendar months even without a recent workout", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T06:59:00Z"));
  mocks.execute.mockResolvedValue([]);

  const data = await getCachedActivityMosaic(12);
  expect(data).toMatchObject({
    startDate: "2025-10-01",
    endDate: "2026-09-30",
    days: [],
    activeDays: 0,
  });
  const query = mocks.execute.mock.calls[0]![0] as SQL;
  const { params } = new PgDialect().sqlToQuery(query);
  expect(params).toContain("2025-10-01");
  expect(params).toContain("2026-09-30");
});
