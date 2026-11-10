import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  isMirrorAuthorized,
  mirrorWeighInsQuery,
  parseMirrorRange,
  toMirrorWeighIns,
} from "./mirror";

const params = (query: string) => new URLSearchParams(query);

describe("isMirrorAuthorized", () => {
  it("accepts only the configured bearer token", () => {
    expect(isMirrorAuthorized("Bearer invented-token", "invented-token")).toBe(
      true,
    );
    expect(isMirrorAuthorized("bearer invented-token", "invented-token")).toBe(
      true,
    );
    expect(isMirrorAuthorized("Bearer invented-tokem", "invented-token")).toBe(
      false,
    );
    expect(isMirrorAuthorized("Bearer invented", "invented-token")).toBe(false);
    expect(isMirrorAuthorized("invented-token", "invented-token")).toBe(false);
    expect(isMirrorAuthorized("Bearer ", "invented-token")).toBe(false);
    expect(isMirrorAuthorized(null, "invented-token")).toBe(false);
  });

  it("refuses everything when no token is configured", () => {
    expect(isMirrorAuthorized("Bearer ", undefined)).toBe(false);
    expect(isMirrorAuthorized("Bearer anything", undefined)).toBe(false);
    expect(isMirrorAuthorized("Bearer ", "")).toBe(false);
  });
});

describe("parseMirrorRange", () => {
  it("reads an inclusive range of real dates", () => {
    expect(parseMirrorRange(params("from=2026-10-27&to=2026-11-09"))).toEqual({
      range: { from: "2026-10-27", to: "2026-11-09" },
    });
    expect(parseMirrorRange(params("from=2026-11-09&to=2026-11-09"))).toEqual({
      range: { from: "2026-11-09", to: "2026-11-09" },
    });
  });

  it("allows a whole leap year and nothing longer", () => {
    expect(parseMirrorRange(params("from=2024-01-01&to=2024-12-31"))).toEqual({
      range: { from: "2024-01-01", to: "2024-12-31" },
    });
    expect(parseMirrorRange(params("from=2024-01-01&to=2025-01-01"))).toEqual({
      error: "ask for at most 366 days at a time",
    });
  });

  it.each([
    ["", "missing"],
    ["from=2026-11-01", "missing to"],
    ["from=2026-02-30&to=2026-03-01", "not a real date"],
    ["from=2026-1-01&to=2026-12-31", "not zero-padded"],
    ["from=2O26-01-01&to=2026-12-31", "a letter"],
    ["from=2026-01-01T00:00&to=2026-12-31", "a time"],
  ])("refuses %j (%s)", (query) => {
    expect(parseMirrorRange(params(query))).toEqual({
      error: "from and to must be dates written YYYY-MM-DD",
    });
  });

  it("refuses a backwards range", () => {
    expect(parseMirrorRange(params("from=2026-11-09&to=2026-11-08"))).toEqual({
      error: "from must not be after to",
    });
  });
});

describe("toMirrorWeighIns", () => {
  const range = { from: "2026-11-01", to: "2026-11-03" };

  it("keeps the range's weigh-ins, oldest first, with date and pounds only", () => {
    const rows = [
      { date: "2026-11-03", pounds: 171.2, excluded: true, updatedAt: "x" },
      { date: "2026-10-31", pounds: 170.8, excluded: false, updatedAt: "x" },
      { date: "2026-11-01", pounds: 170.4, excluded: false, updatedAt: "x" },
      { date: "2026-11-04", pounds: 170.6, excluded: false, updatedAt: "x" },
    ];
    expect(toMirrorWeighIns(rows, range)).toEqual([
      { date: "2026-11-01", pounds: 170.4 },
      { date: "2026-11-03", pounds: 171.2 },
    ]);
  });
});

describe("mirrorWeighInsQuery", () => {
  // Never connects: postgres() opens a connection only when a query runs.
  const db = drizzle(postgres("postgres://invented@127.0.0.1:1/invented"));

  it("selects date and pounds between the two dates and nothing else", () => {
    const { sql, params } = mirrorWeighInsQuery(db, {
      from: "2026-01-01",
      to: "2026-12-31",
    }).toSQL();
    expect(sql).toBe(
      'select "date", "pounds" from "weight_log_weigh_ins" ' +
        'where ("weight_log_weigh_ins"."date" >= $1 and ' +
        '"weight_log_weigh_ins"."date" <= $2) ' +
        'order by "weight_log_weigh_ins"."date" asc',
    );
    expect(params).toEqual(["2026-01-01", "2026-12-31"]);
  });
});
