import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";

import { youtubeRouter } from "./youtube";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("~/server/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("~/env", () => ({ env: { DAD_CONTENT_PASSWORD: "test" } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("~/lib/youtube/sync", () => ({ syncYouTube: vi.fn() }));
vi.mock("~/server/api/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    createTRPCRouter: t.router,
    publicProcedure: t.procedure,
    protectedProcedure: t.procedure,
    cookieProtectedProcedure: t.procedure,
  };
});

/** An archive Google built at 7 PM Pacific on Sep 12. */
const COVERAGE_THROUGH = new Date("2026-09-13T02:00:00.000Z");

const dialect = new PgDialect();
const executed = () =>
  mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query as SQL));

beforeEach(() => {
  vi.useFakeTimers();
  // Three weeks after the export, with no newer one ingested.
  vi.setSystemTime(new Date("2026-10-02T19:00:00Z"));
  mocks.execute.mockImplementation(async (query: SQL) =>
    dialect.sqlToQuery(query).sql.includes("AS covered_through")
      ? [{ covered_through: COVERAGE_THROUGH }]
      : [],
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

const caller = youtubeRouter.createCaller({
  db,
  session: null,
  headers: new Headers(),
});

describe("getInformationDietChannels", () => {
  it("covers the same 30 days as the headline, not the 30 before today", async () => {
    await caller.getInformationDietChannels({ timeRange: "30d" });

    const channels = executed().find((q) => q.sql.includes("channel_events"));
    expect(channels?.sql).not.toMatch(/NOW\(\)\s*-\s*INTERVAL/);
    // Aug 13 4am through the end of Sep 11, the last covered watch-day.
    expect(channels?.params).toContain("2026-08-13T11:00:00.000Z");
    expect(channels?.params).toContain("2026-09-12T11:00:00.000Z");
  });

  it("keeps every Watch Event for the full history", async () => {
    await caller.getInformationDietChannels({ timeRange: "all" });

    const channels = executed().find((q) => q.sql.includes("channel_events"));
    expect(channels?.sql).toMatch(/WHERE\s+TRUE/);
  });
});

describe("getInformationDietSummary", () => {
  it("compares the last 30 covered days against the 30 before them", async () => {
    await caller.getInformationDietSummary();

    const summary = executed().find((q) => q.sql.includes("'current'"));
    expect(summary?.params).toEqual(
      expect.arrayContaining([
        "2026-07-14T11:00:00.000Z",
        "2026-08-13T11:00:00.000Z",
        "2026-09-12T11:00:00.000Z",
      ]),
    );
  });
});
