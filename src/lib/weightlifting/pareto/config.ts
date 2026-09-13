/** Optional display-floor overrides, not an allowlist. Variations stay separate. */
export const PARETO_LIFTS = [
  {
    id: "bench",
    label: "Bench press",
    displayName: "Flat Barbell Bench Press",
    floor: 300,
  },
  { id: "squat", label: "Back squat", displayName: "Back Squats", floor: 300 },
  {
    id: "deadlift",
    label: "Sumo deadlift",
    displayName: "Sumo Deadlifts",
    floor: 300,
  },
  {
    id: "overhead",
    label: "Overhead press",
    displayName: "Barbell Overhead Press",
    floor: 175,
  },
] as const;
export function getParetoConfig(displayName: string) {
  return (
    PARETO_LIFTS.find((lift) => lift.displayName === displayName) ?? {
      id: displayName,
      label: displayName,
      displayName,
      floor: 0,
    }
  );
}
