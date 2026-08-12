import { describe, expect, it } from "vitest";

import { UNITS, unitIndexFromHash } from "./data";

describe("homepage 3D traverse order", () => {
  const orderedSlugs = [
    "about",
    "books",
    "training",
    "systems",
    "projects",
    "blog",
    "talks",
  ] as const;

  it("keeps the canonical seven-unit traverse", () => {
    expect(UNITS.map((unit) => unit.slug)).toEqual(orderedSlugs);
  });

  it("resolves every canonical slug hash to its traverse index", () => {
    for (const [index, slug] of orderedSlugs.entries()) {
      expect(unitIndexFromHash(`#${slug}`)).toBe(index);
      expect(unitIndexFromHash(slug)).toBe(index);
    }
    expect(unitIndexFromHash("#unknown")).toBeNull();
  });
});
