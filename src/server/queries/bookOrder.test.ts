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
  // The pin group is COALESCE(finished, abandoned) IS NULL: abandoned books
  // take their drop date as their place in the timeline instead of sitting
  // in the currently-reading group forever.
  it("orders in-progress books with notes first, then by start date", () => {
    expect(compileOrderBy("finished", "desc")).toEqual([
      "CASE WHEN COALESCE(\"books\".\"finished\", \"books\".\"abandoned\") IS NULL THEN 0 ELSE 1 END asc",
      "CASE WHEN COALESCE(\"books\".\"finished\", \"books\".\"abandoned\") IS NULL THEN \"books\".\"has_notes\" END desc",
      "CASE WHEN COALESCE(\"books\".\"finished\", \"books\".\"abandoned\") IS NULL THEN \"books\".\"started\" END desc",
      "COALESCE(\"books\".\"finished\", \"books\".\"abandoned\") desc",
      "\"books\".\"title\" asc",
      "\"books\".\"id\" asc",
    ]);
  });

  it("keeps ascending finished-date behavior deterministic", () => {
    expect(compileOrderBy("finished", "asc")).toEqual([
      "COALESCE(\"books\".\"finished\", \"books\".\"abandoned\", NOW()) asc",
      "\"books\".\"title\" asc",
      "\"books\".\"id\" asc",
    ]);
  });
});
