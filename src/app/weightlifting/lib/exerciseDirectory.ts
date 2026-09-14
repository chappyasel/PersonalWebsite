import type { ExerciseDirectoryEntry } from "~/server/queries/exerciseDirectory";

export const EXERCISE_SORTS = ["recent", "instances", "name"] as const;
export type ExerciseSort = (typeof EXERCISE_SORTS)[number];

export function filterExerciseDirectory(
  entries: ExerciseDirectoryEntry[],
  query: string,
  category: string,
  sort: ExerciseSort,
) {
  const terms = query
    .toLocaleLowerCase("en-US")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return entries
    .filter(
      (entry) =>
        (category === "all" || entry.category === category) &&
        terms.every((term) =>
          `${entry.displayName} ${entry.category}`
            .toLocaleLowerCase("en-US")
            .includes(term),
        ),
    )
    .sort((a, b) => {
      const name = a.displayName.localeCompare(b.displayName, "en-US");
      const recent = b.lastPerformed.localeCompare(a.lastPerformed);
      if (sort === "instances")
        return b.instanceCount - a.instanceCount || recent || name;
      if (sort === "name") return name;
      return recent || name;
    });
}

/** The import stores Pacific reporting dates in UTC calendar fields. */
export function exerciseLastUsed(ts: string) {
  return new Date(`${ts}:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
