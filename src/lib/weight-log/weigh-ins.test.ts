import { drizzle } from "drizzle-orm/pg-proxy";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/server/db/schema";

import { PLAN_LOCK } from "./plan-edits";
import {
  OUTSIDE_SHORTCUT_WINDOW,
  shortcutWindow,
  parseCardDate,
  parseWeighInRequest,
  saveWeighIn,
} from "./weigh-ins";

/**
 * `saveWeighIn` against a recording database. Drizzle's proxy driver builds
 * the real SQL and hands it here, so the tests see exactly what Postgres
 * would run. Every number is invented.
 */
interface Query {
  sql: string;
  params: unknown[];
}

let queries: Query[] = [];
/** Replies for the queries in order. A query with none left gets no rows. */
let replies: unknown[][][] = [];

const db = drizzle(
  async (sql, params) => {
    queries.push({ sql, params });
    return { rows: replies.shift() ?? [] };
  },
  { schema },
);
Object.assign(db, {
  transaction: async (run: (tx: typeof db) => Promise<unknown>) => {
    queries.push({ sql: "begin", params: [] });
    try {
      const result = await run(db);
      queries.push({ sql: "commit", params: [] });
      return result;
    } catch (error) {
      queries.push({ sql: "rollback", params: [] });
      throw error;
    }
  },
});

const LOCK = "select pg_advisory_xact_lock_shared($1)";
const READ =
  'select "pounds" from "weight_log_weigh_ins" where "weight_log_weigh_ins"."date" = $1 for update';
const INSERT =
  'insert into "weight_log_weigh_ins" ("date", "pounds", "excluded", "updated_at") values ($1, $2, default, default) on conflict ("date") do nothing returning "date"';
const UPDATE =
  'update "weight_log_weigh_ins" set "pounds" = $1, "updated_at" = $2 where "weight_log_weigh_ins"."date" = $3';

const statements = () => queries.map((query) => query.sql);

beforeEach(() => {
  queries = [];
  replies = [];
});

describe("saveWeighIn", () => {
  it("saves a date that has no weigh-in", async () => {
    replies = [[], [], [["2001-01-09"]]];
    await expect(
      saveWeighIn(db as never, {
        date: "2001-01-09",
        pounds: 150.2,
        replace: false,
      }),
    ).resolves.toEqual({ status: "saved", previous: null });
    expect(statements()).toEqual(["begin", LOCK, READ, INSERT, "commit"]);
    expect(queries[1]!.params).toEqual([PLAN_LOCK]);
    expect(queries[2]!.params).toEqual(["2001-01-09"]);
    expect(queries[3]!.params).toEqual(["2001-01-09", 150.2]);
  });

  it("takes the shared plan lock before it reads or writes", async () => {
    replies = [[], [], [["2001-01-09"]]];
    await saveWeighIn(db as never, {
      date: "2001-01-09",
      pounds: 150.2,
      replace: true,
    });
    expect(statements().indexOf(LOCK)).toBe(1);
  });

  it("reports a different weigh-in and writes nothing when replace is false", async () => {
    replies = [[], [[149.8]]];
    await expect(
      saveWeighIn(db as never, {
        date: "2001-01-09",
        pounds: 150.2,
        replace: false,
      }),
    ).resolves.toEqual({ status: "exists", previous: 149.8 });
    expect(statements()).toEqual(["begin", LOCK, READ, "commit"]);
  });

  it("replaces only the pounds when replace is true, so excluded stays", async () => {
    replies = [[], [[149.8]], []];
    await expect(
      saveWeighIn(db as never, {
        date: "2001-01-09",
        pounds: 150.2,
        replace: true,
      }),
    ).resolves.toEqual({ status: "replaced", previous: 149.8 });
    expect(statements()).toEqual(["begin", LOCK, READ, UPDATE, "commit"]);
    expect(queries[3]!.sql).not.toContain('"excluded"');
    const { params } = queries[3]!;
    expect([params[0], params[2]]).toEqual([150.2, "2001-01-09"]);
    expect(typeof params[1]).toBe("string");
  });

  it.each([true, false])(
    "writes nothing when the date already has these pounds (replace %s)",
    async (replace) => {
      replies = [[], [[150.2]]];
      await expect(
        saveWeighIn(db as never, {
          date: "2001-01-09",
          pounds: 150.2,
          replace,
        }),
      ).resolves.toEqual({ status: "unchanged", previous: 150.2 });
      expect(statements()).toEqual(["begin", LOCK, READ, "commit"]);
    },
  );

  it("reads again when another save inserted the date first", async () => {
    // The first read finds nothing, the insert loses to a concurrent save,
    // and the second read finds that save's row.
    replies = [[], [], [], [[149.8]]];
    await expect(
      saveWeighIn(db as never, {
        date: "2001-01-09",
        pounds: 150.2,
        replace: false,
      }),
    ).resolves.toEqual({ status: "exists", previous: 149.8 });
    expect(statements()).toEqual(["begin", LOCK, READ, INSERT, READ, "commit"]);
  });
});

describe("shortcutWindow", () => {
  it("is the server's UTC date and a day either side", () => {
    expect(shortcutWindow(new Date("2030-01-01T23:30:00Z"))).toEqual({
      earliest: "2029-12-31",
      latest: "2030-01-02",
    });
  });
});

describe("parseWeighInRequest", () => {
  const now = new Date("2030-01-08T12:00:00Z");

  it.each(["2030-01-07", "2030-01-08", "2030-01-09"])(
    "accepts %s, inside the window",
    (date) => {
      expect(parseWeighInRequest({ date, pounds: 150 }, now)).toEqual({
        weighIn: { date, pounds: 150, replace: false },
      });
    },
  );

  it.each(["2030-01-06", "2030-01-10", "2029-01-08"])(
    "refuses %s, outside the window",
    (date) => {
      expect(parseWeighInRequest({ date, pounds: 150 }, now)).toEqual({
        error: OUTSIDE_SHORTCUT_WINDOW,
      });
    },
  );

  it("takes pounds as a number or a numeric string, rounded to one decimal", () => {
    const pounds = (value: unknown) =>
      parseWeighInRequest({ date: "2030-01-08", pounds: value }, now);
    expect(pounds(150.25)).toMatchObject({ weighIn: { pounds: 150.3 } });
    expect(pounds("150.24")).toMatchObject({ weighIn: { pounds: 150.2 } });
    expect(pounds(" 150 ")).toMatchObject({ weighIn: { pounds: 150 } });
  });

  it.each([0, 0.04, -1, 1500.1, "", "abc", "1e2", "150,2", null, true])(
    "refuses pounds of %j",
    (value) => {
      expect(
        parseWeighInRequest({ date: "2030-01-08", pounds: value }, now),
      ).toEqual({ error: "pounds must be a number above 0 and at most 1500" });
    },
  );

  it("reads replace as a boolean or as the text true or false", () => {
    const replace = (value: unknown) =>
      parseWeighInRequest(
        { date: "2030-01-08", pounds: 150, replace: value },
        now,
      );
    expect(replace(true)).toMatchObject({ weighIn: { replace: true } });
    expect(replace("true")).toMatchObject({ weighIn: { replace: true } });
    expect(replace(false)).toMatchObject({ weighIn: { replace: false } });
    expect(replace("false")).toMatchObject({ weighIn: { replace: false } });
    expect(replace("yes")).toEqual({ error: "replace must be true or false" });
  });

  it("refuses a malformed date or body", () => {
    expect(parseWeighInRequest({ date: "2030-02-30", pounds: 150 }, now)).toEqual(
      { error: "date must be a date written YYYY-MM-DD" },
    );
    expect(parseWeighInRequest({ date: "Jan 8", pounds: 150 }, now)).toEqual({
      error: "date must be a date written YYYY-MM-DD",
    });
    expect(parseWeighInRequest(null, now)).toEqual({
      error: "Send a JSON object with date, pounds, and replace",
    });
    expect(parseWeighInRequest([150], now)).toEqual({
      error: "Send a JSON object with date, pounds, and replace",
    });
  });
});

describe("parseCardDate", () => {
  const now = new Date("2030-01-08T12:00:00Z");

  it("reads a date inside the window and refuses the rest", () => {
    expect(parseCardDate("2030-01-07", now)).toEqual({ date: "2030-01-07" });
    expect(parseCardDate("2030-01-09", now)).toEqual({ date: "2030-01-09" });
    const refused = parseCardDate("2030-01-06", now);
    expect("error" in refused && refused.error).toContain("today or yesterday");
    expect(parseCardDate(null, now)).toEqual({
      error: "date must be a date written YYYY-MM-DD",
    });
  });
});
