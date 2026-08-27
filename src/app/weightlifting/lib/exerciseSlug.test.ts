import { describe, expect, it } from "vitest";

import { buildSlugMap, exerciseSlug } from "./exerciseSlug";

describe("exerciseSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(exerciseSlug("Flat Barbell Bench Press")).toBe(
      "flat-barbell-bench-press",
    );
  });

  it("collapses punctuation and numbers cleanly", () => {
    expect(exerciseSlug("70 Degree Incline Press")).toBe(
      "70-degree-incline-press",
    );
    expect(exerciseSlug("One-arm Overhead Extensions")).toBe(
      "one-arm-overhead-extensions",
    );
  });

  it("trims leading and trailing separators", () => {
    expect(exerciseSlug("  Close-grip Bench Press ")).toBe(
      "close-grip-bench-press",
    );
  });
});

describe("buildSlugMap", () => {
  it("maps each name to its slug", () => {
    const map = buildSlugMap(["Back Squats", "Conventional Deadlifts"]);
    expect(map.get("Back Squats")).toBe("back-squats");
    expect(map.get("Conventional Deadlifts")).toBe("conventional-deadlifts");
  });

  it("suffixes collisions deterministically in input order", () => {
    const map = buildSlugMap(["Lat Pulldowns", "Lat  Pulldowns"]);
    expect(map.get("Lat Pulldowns")).toBe("lat-pulldowns");
    expect(map.get("Lat  Pulldowns")).toBe("lat-pulldowns-2");
  });
});
