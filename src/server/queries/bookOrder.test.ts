import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getBookOrderBy } from "./bookOrder";

const dialect = new PgDialect();

function compileOrderBy(sortField: Parameters<typeof getBookOrderBy>[0], sortOrder: Parameters<typeof getBookOrderBy>[1]) {
  return getBookOrderBy(sortField, sortOrder).map(
    (expression) => dialect.sqlToQuery(expression).sql,
  );
}

describe("getBookOrderBy", () => {
  it("orders in-progress books with notes first, then by start date", () => {
    expect(compileOrderBy("finished", "desc")).toEqual([
      "CASE WHEN \"books\".\"finished\" IS NULL THEN 0 ELSE 1 END asc",
      "CASE WHEN \"books\".\"finished\" IS NULL THEN \"books\".\"has_notes\" END desc",
      "CASE WHEN \"books\".\"finished\" IS NULL THEN \"books\".\"started\" END desc",
      "\"books\".\"finished\" desc",
      "\"books\".\"title\" asc",
      "\"books\".\"id\" asc",
    ]);
  });

  it("keeps ascending finished-date behavior deterministic", () => {
    expect(compileOrderBy("finished", "asc")).toEqual([
      "COALESCE(\"books\".\"finished\", NOW()) asc",
      "\"books\".\"title\" asc",
      "\"books\".\"id\" asc",
    ]);
  });
});
