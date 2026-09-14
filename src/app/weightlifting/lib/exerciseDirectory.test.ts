import { expect, it } from "vitest";

import { exerciseLastUsed, filterExerciseDirectory } from "./exerciseDirectory";

const entries = [
  {
    displayName: "Walking",
    category: "Cardio",
    instanceCount: 50,
    lastPerformed: "2026-09-13T08:00",
    slug: "history",
    name: "Example",
    style: "duration",
    allVariantsSlug: "all",
  },
  {
    displayName: "Flat Bench Press",
    category: "Chest",
    instanceCount: 100,
    lastPerformed: "2026-09-12T08:00",
    slug: "flat-bench-press",
    name: "Bench Press",
    style: "reps_weight",
    allVariantsSlug: "all-bench",
  },
  {
    displayName: "Cable Fly",
    category: "Chest",
    instanceCount: 3,
    lastPerformed: "2026-09-13T18:00",
    slug: "history",
    name: "Example",
    style: "duration",
    allVariantsSlug: "all",
  },
];
it("sorts by the complete last-instance time, including sessions on the same day", () => {
  expect(
    filterExerciseDirectory(entries, "", "all", "recent").map(
      (e) => e.displayName,
    ),
  ).toEqual(["Cable Fly", "Walking", "Flat Bench Press"]);
});
it("sorts by instances or name without changing the original list", () => {
  expect(
    filterExerciseDirectory(entries, "", "all", "instances").map(
      (e) => e.instanceCount,
    ),
  ).toEqual([100, 50, 3]);
  expect(
    filterExerciseDirectory(entries, "", "all", "name").map(
      (e) => e.displayName,
    ),
  ).toEqual(["Cable Fly", "Flat Bench Press", "Walking"]);
  expect(entries[0]?.displayName).toBe("Walking");
});
it("combines category and multiword case-insensitive search without excluding exercises lacking charts", () => {
  expect(
    filterExerciseDirectory(entries, " cable CHEST ", "Chest", "recent").map(
      (e) => e.displayName,
    ),
  ).toEqual(["Cable Fly"]);
  expect(
    filterExerciseDirectory(entries, "Walking", "Chest", "recent"),
  ).toEqual([]);
  expect(
    filterExerciseDirectory(entries, "", "Cardio", "recent")[0]?.slug,
  ).toBe("history");
});
it("preserves the workout reporting date in date labels", () => {
  expect(exerciseLastUsed("2026-01-01T00:15")).toBe("Jan 1, 2026");
});
