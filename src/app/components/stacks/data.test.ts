import { describe, expect, it } from "vitest";

import {
  GOLF_FOCUS_END,
  GOLF_FOCUS_START,
  GOLF_STOP_POSITION,
  GOLF_UNIT_INDEX,
  UNITS,
  golfFocusedForScenePosition,
  initialScenePositionFromLocation,
  sceneUrlForLocation,
  unitIndexFromHash,
  unitUrlForLocation,
} from "./data";

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

  it("uses human-facing public hashes while retaining legacy aliases", () => {
    expect(unitIndexFromHash("#golf")).toBeNull();
    expect(unitIndexFromHash("#weightlifting")).toBe(2);
    expect(unitIndexFromHash("#training")).toBe(2);
    expect(unitIndexFromHash("#musings")).toBe(5);
    expect(unitIndexFromHash("#blog")).toBe(5);
    expect(unitUrlForLocation("/", "", 2)).toBe("/#weightlifting");
    expect(unitUrlForLocation("/", "", 5)).toBe("/#musings");
  });

  it("shortens Talks only in the unit rail", () => {
    const talks = UNITS.find((unit) => unit.slug === "talks");

    expect(talks?.railLabel).toBe("Talks");
    expect(talks?.label).toBe("Featured Talks");
  });

  it("uses a distinct hidden stop between Books and Weightlifting", () => {
    expect(GOLF_UNIT_INDEX).toBe(2);
    expect(GOLF_STOP_POSITION).toBeGreaterThan(1);
    expect(GOLF_STOP_POSITION).toBeLessThan(2);
    expect(GOLF_FOCUS_START).toBeGreaterThan(1.35);
    expect(GOLF_FOCUS_START).toBeLessThan(GOLF_STOP_POSITION);
    expect(GOLF_FOCUS_END).toBeGreaterThan(GOLF_STOP_POSITION);
    expect(GOLF_FOCUS_END).toBeGreaterThan(1.75);
    expect(GOLF_FOCUS_END).toBeLessThan(2);
    expect(initialScenePositionFromLocation("/golf", "")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/golf/", "")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/golf", "#systems")).toBe(3);
    expect(initialScenePositionFromLocation("/", "#golf")).toBe(
      GOLF_STOP_POSITION,
    );
    expect(initialScenePositionFromLocation("/", "")).toBe(0);
    expect(initialScenePositionFromLocation("/", "#training")).toBe(2);
    expect(golfFocusedForScenePosition(GOLF_STOP_POSITION)).toBe(true);
    expect(golfFocusedForScenePosition(GOLF_FOCUS_START - 0.01)).toBe(false);
    expect(golfFocusedForScenePosition(GOLF_FOCUS_END + 0.01)).toBe(false);
    expect(golfFocusedForScenePosition(2)).toBe(false);
  });

  it("keeps each pathname default clean and hashes every non-default stop", () => {
    expect(sceneUrlForLocation("/golf", "", 2, true)).toBe("/golf");
    expect(sceneUrlForLocation("/", "", 2, true)).toBe("/#golf");
    expect(unitUrlForLocation("/golf", "", 2)).toBe("/golf#weightlifting");
    expect(unitUrlForLocation("/golf", "?quality=2", 2)).toBe(
      "/golf?quality=2#weightlifting",
    );
    expect(unitUrlForLocation("/golf", "", 0)).toBe("/golf#about");
    expect(unitUrlForLocation("/golf", "", 3)).toBe("/golf#systems");
    expect(unitUrlForLocation("/", "", 0)).toBe("/");
    expect(unitUrlForLocation("/", "", 2)).toBe("/#weightlifting");
  });
});
