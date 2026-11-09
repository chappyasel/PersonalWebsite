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
 * The router against a recording database. Drizzle's proxy driver builds the
 * real SQL and hands it here, so the tests see exactly what Postgres would
 * run. Every number is invented.
 */
interface Query {
  sql: string;
  params: unknown[];
}

let queries: Query[] = [];
let tables: Record<string, unknown[][]> = {};
let returned: unknown[][] = [];

const db = drizzle(
  async (sql, params) => {
    queries.push({ sql, params });
    const read = /^select .* from "(weight_log_[a-z_]+)"$/.exec(sql);
    return { rows: read ? (tables[read[1]!] ?? []) : returned };
  },
  { schema },
);

const owner: Session = {
  user: { id: "owner", email: "owner@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};

const caller = createCallerFactory(
  createTRPCRouter({ weightLog: weightLogRouter }),
)({ db: db as never, session: owner, headers: new Headers() }).weightLog;

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return "fulfilled";
  } catch (error) {
    return error instanceof TRPCError ? error.code : "other";
  }
}

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  queries = [];
  tables = {};
  returned = [];
  vi.useRealTimers();
});

describe("weightLog.upsertWeighIn", () => {
  it("replaces a same-date weigh-in's pounds and leaves its excluded flag", async () => {
    returned = [["2001-01-09", 150.2]];
    await expect(
      caller.upsertWeighIn({ date: "2001-01-09", pounds: 150.24 }),
    ).resolves.toEqual({ date: "2001-01-09", pounds: 150.2 });

    expect(queries).toHaveLength(1);
    const [{ sql, params }] = queries as [Query];
    expect(sql).toMatch(
      /^insert into "weight_log_weigh_ins" \("date", "pounds", "excluded", "updated_at"\) values \(\$1, \$2, default, default\) on conflict \("date"\) do update set "pounds" = \$3, "updated_at" = \$4 returning "date", "pounds"$/,
    );
    // The conflict branch never writes `excluded` (decision 14).
    expect(sql.split("do update set")[1]).not.toContain('"excluded"');
    expect(params.slice(0, 3)).toEqual(["2001-01-09", 150.2, 150.2]);
    expect(typeof params[3]).toBe("string");
  });

  it("rounds pounds to one decimal place", async () => {
    returned = [["2001-01-09", 150.3]];
    await caller.upsertWeighIn({ date: "2001-01-09", pounds: 150.25 });
    expect(queries[0]!.params[1]).toBe(150.3);
  });

  it("refuses a date after tomorrow, bad pounds, and a malformed date, without a query", async () => {
    // Only the clock: the dev timing middleware still needs real timeouts.
    vi.useFakeTimers({
      now: new Date("2030-01-08T12:00:00Z"),
      toFake: ["Date"],
    });
    expect(
      await errorCode(
        caller.upsertWeighIn({ date: "2030-01-09", pounds: 150 }),
      ),
    ).toBe("fulfilled");
    queries = [];
    const refused = [
      { date: "2030-01-10", pounds: 150 },
      { date: "2030-01-08", pounds: 0 },
      { date: "2030-01-08", pounds: -1 },
      { date: "2030-01-08", pounds: 1500.1 },
      { date: "2030-02-30", pounds: 150 },
      { date: "1999-12-31", pounds: 150 },
    ];
    expect(
      await Promise.all(
        refused.map((input) => errorCode(caller.upsertWeighIn(input))),
      ),
    ).toEqual(refused.map(() => "BAD_REQUEST"));
    expect(queries).toEqual([]);
  });
});

describe("weightLog.deleteWeighIn", () => {
  it("deletes the one row for that date and says whether it existed", async () => {
    returned = [["2001-01-09"]];
    await expect(caller.deleteWeighIn({ date: "2001-01-09" })).resolves.toEqual(
      { deleted: true },
    );
    expect(queries).toEqual([
      {
        sql: 'delete from "weight_log_weigh_ins" where "weight_log_weigh_ins"."date" = $1 returning "date"',
        params: ["2001-01-09"],
      },
    ]);

    returned = [];
    await expect(caller.deleteWeighIn({ date: "2001-01-10" })).resolves.toEqual(
      { deleted: false },
    );
  });
});

describe("weightLog.week", () => {
  it("reads one calendar week's weigh-ins, before any phase as well as inside one", async () => {
    returned = [
      ["2029-12-04", 99.5, false],
      ["2029-12-08", 120, true],
    ];
    await expect(caller.week({ week: "2029-12-03" })).resolves.toEqual({
      week: "2029-12-03",
      weights: [null, 99.5, null, null, null, 120, null],
      excludedDays: [5],
    });
    expect(queries).toEqual([
      {
        sql: 'select "date", "pounds", "excluded" from "weight_log_weigh_ins" where ("weight_log_weigh_ins"."date" >= $1 and "weight_log_weigh_ins"."date" <= $2)',
        params: ["2029-12-03", "2029-12-09"],
      },
    ]);
  });

  it("refuses a day that is not a Monday, without a query", async () => {
    expect(await errorCode(caller.week({ week: "2029-12-04" }))).toBe(
      "BAD_REQUEST",
    );
    expect(queries).toEqual([]);
  });
});

// Rows in column order, as the driver returns them. A cut of two planned
// weeks, then a running bulk of two, with a weigh-in past the bulk's plan.
function seed() {
  const updated = "2030-01-01T00:00:00.000Z";
  tables = {
    weight_log_phases: [
      [1, "cut", "2030-01-07", "2030-01-20"],
      [2, "bulk", "2030-01-21", null],
    ],
    weight_log_planned_weeks: [
      ["2030-01-07", 1, 101, 101],
      ["2030-01-14", 1, 100, 100],
      ["2030-01-21", 2, 100.5, 100.5],
      ["2030-01-28", 2, 101, 100.5],
    ],
    weight_log_weigh_ins: [
      ["2030-01-07", 101, false, updated],
      ["2030-01-08", 102, false, updated],
      ["2030-01-09", 100, false, updated],
      ["2030-01-15", 100, false, updated],
      ["2030-01-21", 100.4, false, updated],
      ["2030-01-22", 120, true, updated],
      ["2030-02-04", 101.2, false, updated],
    ],
  };
}

describe("weightLog.phases", () => {
  it("lists derived names newest first and marks the running phase", async () => {
    seed();
    const { revision, ...phases } = await caller.phases();
    // The plan's fingerprint, which plan edits send back.
    expect(revision).toMatch(/^[0-9a-f]{16}$/);
    expect(phases).toEqual({
      currentId: "2",
      runningId: "2",
      phases: [
        {
          id: "2",
          label: "Bulk Jan '30 - Feb '30",
          start: "2030-01-21",
          end: "2030-02-03",
        },
        {
          id: "1",
          label: "Cut Jan '30 - Jan '30",
          start: "2030-01-07",
          end: "2030-01-20",
        },
      ],
    });
  });
});

describe("weightLog.weekTable", () => {
  it("builds a phase's weeks with averages, deltas, and gaps", async () => {
    seed();
    const { phaseId, rows } = await caller.weekTable({ phaseId: "1" });
    expect(phaseId).toBe("1");
    expect(rows.map((row) => row.week)).toEqual(["2030-01-07", "2030-01-14"]);
    expect(rows[0]).toMatchObject({
      weights: [101, 102, 100, null, null, null, null],
      average: 101,
      change: null,
      target: 101,
      gapToTarget: 0,
      poundsPerWeek: null,
      gapToOriginalTarget: 0,
    });
    expect(rows[1]).toMatchObject({
      average: 100,
      change: -1,
      gapToTarget: 0,
      poundsPerWeek: -1,
    });
  });

  it("keeps an excluded weigh-in visible but out of the average, and shows weeks past the plan", async () => {
    seed();
    const { rows } = await caller.weekTable({ phaseId: "2" });
    expect(rows.map((row) => row.week)).toEqual([
      "2030-01-21",
      "2030-01-28",
      "2030-02-04",
    ]);
    expect(rows[0]).toMatchObject({
      weights: [100.4, 120, null, null, null, null, null],
      excludedDays: [1],
      average: 100.4,
      gapToTarget: expect.closeTo(-0.1, 5) as number,
    });
    expect(rows[0]!.change).toBeCloseTo(0.4);
    expect(rows[1]).toMatchObject({
      average: null,
      target: 101,
      poundsPerWeek: 0.5,
      gapToOriginalTarget: 0.5,
    });
    expect(rows[2]).toMatchObject({ average: 101.2, target: null });
  });

  it("refuses a phase that does not exist", async () => {
    seed();
    expect(await errorCode(caller.weekTable({ phaseId: "9" }))).toBe(
      "NOT_FOUND",
    );
  });
});
