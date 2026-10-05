import type { ChartSelectableExercise } from "~/server/queries/weightliftingExercises";

/**
 * Base exercise names that can be featured whole: "Deadlifts" charts and
 * ranks every deadlift variation as one lift. Listed by hand, because doing
 * this for every base name would also merge Flat and Incline Barbell Bench
 * Press. Typed non-empty because the queries splice it into `IN (...)`, and
 * `IN ()` is invalid SQL.
 */
export const BASE_NAME_LIFTS: [string, ...string[]] = ["Deadlifts"];

/**
 * The dashboard picker's list, strongest first, from every chart-selectable
 * row regardless of set count. A variation needs `minSets` on its own; a
 * base-name lift needs them across all its variations, so its best matches
 * the chart and the Featured Lifts table. Variations stay selectable.
 */
export function withBaseNameLifts(
  exercises: ChartSelectableExercise[],
  minSets: number,
) {
  const lifts = BASE_NAME_LIFTS.flatMap((name) => {
    const variations = exercises.filter((e) => e.name === name);
    const setCount = variations.reduce((sum, e) => sum + e.setCount, 0);
    if (variations.length === 0 || setCount < minSets) return [];
    const most = variations.reduce((a, b) => (b.setCount > a.setCount ? b : a));
    return [
      {
        displayName: name,
        name,
        category: most.category,
        setCount,
        bestOneRM: Math.max(...variations.map((e) => e.bestOneRM)),
      },
    ];
  });
  return [
    // First, so the stable sort keeps a lift above a variation that ties it
    ...lifts,
    // A variation-less row already named like the lift is folded into it
    ...exercises.filter(
      (e) => e.setCount >= minSets && !BASE_NAME_LIFTS.includes(e.displayName),
    ),
  ].sort((a, b) => b.bestOneRM - a.bestOneRM);
}
