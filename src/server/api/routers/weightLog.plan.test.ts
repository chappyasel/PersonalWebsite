import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { Session } from "next-auth";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { weightLogRouter } from "~/server/api/routers/weightLog";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import * as schema from "~/server/db/schema";

vi.mock("~/env", () => ({ env: { OWNER_EMAIL: "owner@example.test" } }));
vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("~/server/db", () => ({ db: {} }));

/**
 * The plan and set point mutations against a recording database. Drizzle's
 * proxy driver builds the real SQL; the plan math itself is covered in
 * src/lib/weight-log/plan-edits.test.ts. Every number is invented.
 */

let statements: string[] = [];
let params: unknown[][] = [];
let tables: Record<string, unknown[][]> = {};
const NEW_PHASE_ID = 3;

const db = drizzle(
  async (sql, values) => {
    statements.push(sql);
    params.push(values);
    if (sql.startsWith('insert into "weight_log_phases"')) {
      return { rows: [[NEW_PHASE_ID]] };
    }
    const read = /^select .* from "(weight_log_[a-z_]+)"/.exec(sql);
    return { rows: read ? (tables[read[1]!] ?? []) : [] };
  },
  { schema },
);
// The proxy driver has no transactions. This one records where each begins
// and ends, so the tests can see that an edit's writes share one.
const mark = (sql: string) => {
  statements.push(sql);
  params.push([]);
};
Object.assign(db, {
  transaction: async (run: (tx: typeof db) => Promise<unknown>) => {
    mark("begin");
    try {
      const result = await run(db);
      mark("commit");
      return result;
    } catch (error) {
      mark("rollback");
      throw error;
    }
  },
});

const owner: Session = {
  user: { id: "owner", email: "owner@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};

const caller = createCallerFactory(
  createTRPCRouter({ weightLog: weightLogRouter }),
)({ db: db as never, session: owner, headers: new Headers() }).weightLog;

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
    return "fulfilled";
  } catch (error) {
    return error instanceof TRPCError
      ? `${error.code}: ${error.message}`
      : String(error);
  }
}

/** A finished cut, then a running bulk of four weeks at +0.5 lb/wk. */
function seed() {
  tables = {
    weight_log_phases: [
      [1, "cut", "2030-01-07", "2030-01-27"],
      [2, "bulk", "2030-01-28", null],
    ],
    weight_log_planned_weeks: [
      ["2030-01-07", 1, 101, 101],
      ["2030-01-14", 1, 100.5, 100.5],
      ["2030-01-21", 1, 100, 100],
      ["2030-01-28", 2, 100, 100],
      ["2030-02-04", 2, 100.5, 100.5],
      ["2030-02-11", 2, 101, 101],
      ["2030-02-18", 2, 101.5, 101.5],
    ],
    // Only the date column is read.
    weight_log_weigh_ins: [["2030-01-28"], ["2030-02-05"]],
  };
}

/** Statements with their tables, without column lists. */
const shapes = () =>
  statements.map((sql) =>
    sql
      .replace(/\(("[a-z_]+", )*"[a-z_]+"\)/g, "(…)")
      .replace(/ where .*| values .*| set .*| returning .*/, ""),
  );

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  statements = [];
  params = [];
  seed();
});

describe("weightLog.startPhase", () => {
  it("writes the whole start in one locked transaction and never writes weigh-ins", async () => {
    await expect(
      caller.startPhase({
        kind: "cut",
        startDate: "2030-02-11",
        startTarget: 101.04,
        poundsPerWeek: -0.504,
        lastWeek: "2030-02-11",
        currentPhaseId: "2",
      }),
    ).resolves.toEqual({ phaseId: String(NEW_PHASE_ID) });

    expect(shapes()).toEqual([
      "begin",
      "select pg_advisory_xact_lock($1)",
      'select "id", "kind", "start_date", "end_date" from "weight_log_phases"',
      'select "week_start", "phase_id", "target", "original_target" from "weight_log_planned_weeks"',
      'select "date" from "weight_log_weigh_ins"',
      'delete from "weight_log_planned_weeks"',
      'update "weight_log_phases"',
      'insert into "weight_log_phases" (…)',
      'insert into "weight_log_planned_weeks" (…)',
      "commit",
    ]);
    expect(statements.some((sql) => /^(insert|update|delete).*weigh_ins/.test(sql))).toBe(false);
    // The empty week past the one-week plan goes; the bulk ends Sunday.
    expect(params[5]).toEqual(["2030-02-18"]);
    expect(params[6]).toEqual(["2030-02-10", 2]);
    expect(params[7]).toEqual(["cut", "2030-02-11", null]);
    // The week on the new start moves to the new phase with the new target
    // as its target and original target, rounded to one decimal.
    expect(statements[8]).toMatch(
      /on conflict \("week_start"\) do update set "phase_id" = excluded\.phase_id, "target" = excluded\.target, "original_target" = excluded\.original_target$/,
    );
    expect(params[8]).toEqual(["2030-02-11", NEW_PHASE_ID, 101, 101]);
  });

  it("refuses a stale page and a plan that drops a weighed-in week, writing nothing", async () => {
    const stale = await refusal(
      caller.startPhase({
        kind: "cut",
        startDate: "2030-02-11",
        startTarget: 101,
        poundsPerWeek: -0.5,
        lastWeek: "2030-02-25",
        currentPhaseId: "1",
      }),
    );
    expect(stale).toMatch(/^CONFLICT: /);
    expect(statements.at(-1)).toBe("rollback");

    statements = [];
    const short = await refusal(
      caller.startPhase({
        kind: "cut",
        startDate: "2030-01-28",
        startTarget: 101,
        poundsPerWeek: -0.5,
        lastWeek: "2030-01-28",
        currentPhaseId: "2",
      }),
    );
    expect(short).toBe(
      "BAD_REQUEST: The plan has to run through the week of Feb 4, 2030, which has weigh-ins.",
    );
    expect(statements.filter((sql) => /^(insert|update|delete)/.test(sql))).toEqual([]);
  });

  it("refuses a start that is not a Monday before reading anything", async () => {
    const result = await refusal(
      caller.startPhase({
        kind: "bulk",
        startDate: "2030-02-12",
        startTarget: 101,
        poundsPerWeek: 0.5,
        lastWeek: "2030-02-25",
        currentPhaseId: "2",
      }),
    );
    expect(result).toMatch(/^BAD_REQUEST/);
    expect(statements).toEqual([]);
  });
});

describe("weightLog.changeRate", () => {
  it("rewrites the week and every later one in its phase", async () => {
    await caller.changeRate({ weekStart: "2030-02-04", poundsPerWeek: 0.25 });
    expect(shapes().slice(-2)).toEqual([
      'insert into "weight_log_planned_weeks" (…)',
      "commit",
    ]);
    // Three rows of (week, phase, target, original target).
    expect(params.at(-2)).toEqual([
      "2030-02-04", 2, 100.25, 100.5,
      "2030-02-11", 2, 100.75, 101,
      "2030-02-18", 2, 101.25, 101.5,
    ]);
  });
});

describe("weightLog.moveEnd", () => {
  it("adds weeks at the last rate with no original target", async () => {
    await caller.moveEnd({ phaseId: "2", lastWeek: "2030-03-04" });
    expect(params.at(-2)).toEqual([
      "2030-02-25", 2, 102, null,
      "2030-03-04", 2, 102.5, null,
    ]);
  });

  it("refuses to remove a week with weigh-ins", async () => {
    expect(
      await refusal(caller.moveEnd({ phaseId: "2", lastWeek: "2030-01-28" })),
    ).toBe(
      "BAD_REQUEST: The week of Feb 4, 2030 has weigh-ins, so the plan can't end before it.",
    );
  });
});

describe("weightLog set points", () => {
  it("reads them in order", async () => {
    tables.weight_log_set_points = [[1, 150], [2, 160.5]];
    await expect(caller.setPoints()).resolves.toEqual([150, 160.5]);
    expect(statements[0]).toMatch(/order by "weight_log_set_points"\."position" asc$/);
  });

  it("replaces the list in one transaction, numbered in order and rounded", async () => {
    await expect(
      caller.saveSetPoints({ pounds: [160.54, 150] }),
    ).resolves.toEqual([160.5, 150]);
    expect(shapes()).toEqual([
      "begin",
      'delete from "weight_log_set_points"',
      'insert into "weight_log_set_points" (…)',
      "commit",
    ]);
    expect(params[2]).toEqual([1, 160.5, 2, 150]);
  });

  it("clears the list with an empty save and refuses bad pounds", async () => {
    await caller.saveSetPoints({ pounds: [] });
    expect(shapes()).toEqual(["begin", 'delete from "weight_log_set_points"', "commit"]);
    statements = [];
    expect(await refusal(caller.saveSetPoints({ pounds: [0] }))).toMatch(
      /^BAD_REQUEST/,
    );
    expect(statements).toEqual([]);
  });
});
