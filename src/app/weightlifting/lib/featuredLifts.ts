import type { ChartSelectableExercise } from "~/server/queries/weightliftingExercises";

/**
 * Base exercise names that can be featured whole: "Deadlifts" charts and
 * ranks every deadlift variation as one lift. Listed by hand, because doing
 * this for every base name would also merge Flat and Incline Barbell Bench
 * Press.
 */
export const BASE_NAME_LIFTS = ["Deadlifts"];

/** The dashboard picker's list, with one entry per base-name lift beside its
 *  variations, which stay selectable on their own. Strongest first. */
export function withBaseNameLifts(exercises: ChartSelectableExercise[]) {
  const lifts = BASE_NAME_LIFTS.flatMap((name) => {
    const variations = exercises.filter((e) => e.name === name);
    if (variations.length === 0) return [];
    const most = variations.reduce((a, b) => (b.setCount > a.setCount ? b : a));
    return [
      {
        displayName: name,
        name,
        category: most.category,
        setCount: variations.reduce((sum, e) => sum + e.setCount, 0),
        bestOneRM: Math.max(...variations.map((e) => e.bestOneRM)),
      },
    ];
  });
  // A variation-less row already named like the lift is folded into it
  return [
    ...exercises.filter((e) => !BASE_NAME_LIFTS.includes(e.displayName)),
    ...lifts,
  ].sort((a, b) => b.bestOneRM - a.bestOneRM);
}
