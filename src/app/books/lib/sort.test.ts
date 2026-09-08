import { describe, expect, it } from "vitest";

import { DEFAULT_SORT_ORDER, SORT_FIELDS, resolveSort } from "./sort";

describe("resolveSort", () => {
  it("defaults to newest read first", () => {
    expect(resolveSort(null, null)).toEqual(["finished", "desc"]);
  });

  it("opens the color sort as a rainbow, red first", () => {
    expect(resolveSort("color", null)).toEqual(["color", "asc"]);
    expect(resolveSort("color", "desc")).toEqual(["color", "desc"]);
    expect(resolveSort("color-desc", null)).toEqual(["color", "desc"]);
  });

  it("keeps color as the last menu entry", () => {
    expect(SORT_FIELDS.at(-1)).toBe("color");
  });

  it("has a default direction for every field", () => {
    for (const field of SORT_FIELDS) {
      expect(DEFAULT_SORT_ORDER[field]).toMatch(/^(asc|desc)$/);
    }
  });

  it("falls back to the read date for unknown fields", () => {
    expect(resolveSort("hue", "asc")).toEqual(["finished", "asc"]);
  });
});
