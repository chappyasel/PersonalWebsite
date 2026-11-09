import { drizzle } from "drizzle-orm/pg-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeImport } from "./import-database";
import type { ImportPlan } from "./import-plan";

// Invented numbers. None of them is the owner's.

const plan: ImportPlan = {
  weighIns: [{ date: "2030-01-07", pounds: 100, excluded: false }],
  phases: [
    {
      startDate: "2030-01-07",
      endDate: null,
      kind: "bulk",
      workbookLabel: "Bulk",
      name: "Bulk Jan '30 - Jan '30",
    },
  ],
  plannedWeeks: [
    {
      weekStart: "2030-01-07",
      phaseStart: "2030-01-07",
      target: 100,
      originalTarget: 100,
    },
  ],
  setPoints: [],
  scans: [],
  recollection: {
    date: "2029-06-01",
    bodyFatLow: 10,
    bodyFatHigh: 12,
    note: "Synthetic",
  },
  strength: [],
  trimmed: [],
};

let queries: string[] = [];
let configs: unknown[] = [];

/**
 * A database that records each statement. Drizzle's proxy driver has no
 * transactions, so the fake runs the callback on the recorder and keeps the
 * transaction's settings. The tables already hold the workbook's one row.
 */
const recorder = drizzle(async (sql, _params, method) => {
  queries.push(sql);
  if (method === "execute") return { rows: [{ rows: 1 }] };
  if (sql.startsWith('select "date", "pounds" from "weight_log_weigh_ins"'))
    return { rows: [["2030-01-07", 100]] };
  if (sql.startsWith('insert into "weight_log_phases"')) return { rows: [[1]] };
  return { rows: [] };
});
const db = {
  transaction: (run: (tx: never) => Promise<unknown>, config?: unknown) => {
    configs.push(config);
    return run(recorder as never);
  },
} as unknown as Parameters<typeof writeImport>[0];

beforeEach(() => {
  queries = [];
  configs = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

const options = { replace: true, discardSiteEntries: false, dryRun: false };
const position = (pattern: RegExp) =>
  queries.findIndex((query) => pattern.test(query));

describe("writeImport", () => {
  it("locks out weigh-in writes before it reads them, through the replacement", async () => {
    await expect(writeImport(db, plan, options)).resolves.toBe(true);
    expect(configs).toHaveLength(1);
    // The owner's save waits for the import rather than landing between the
    // site-entry check and the delete, where --replace would drop it.
    const lock = position(
      /^lock table weight_log_weigh_ins in exclusive mode$/i,
    );
    expect(lock).toBe(0);
    expect(lock).toBeLessThan(position(/from "weight_log_weigh_ins"/));
    expect(lock).toBeLessThan(position(/^delete from "weight_log_weigh_ins"/));
  });

  it("dry-runs in a read-only transaction, which takes no write lock", async () => {
    await expect(
      writeImport(db, plan, { ...options, dryRun: true }),
    ).resolves.toBe(true);
    expect(configs).toEqual([{ accessMode: "read only" }]);
    expect(position(/^lock table/i)).toBe(-1);
    expect(position(/^(insert|delete|update)/)).toBe(-1);
  });
});
