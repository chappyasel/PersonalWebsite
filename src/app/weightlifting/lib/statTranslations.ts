/**
 * Plain-language sublines for the lifetime stat cards. Raw totals mean
 * little to a visitor who doesn't lift; each helper turns one into a rate
 * or a comparison, returning null when the data can't support the claim.
 */

/** Official total weight of the Eiffel Tower: 10,100 tonnes. */
const EIFFEL_TOWER_LBS = 10_100_000 * 2.20462;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.2425;

/** "4.9 a week for 9 years" — requires at least a year of history. */
export function workoutsPerWeekLine(
  totalWorkouts: number,
  earliestWorkout: string | null,
  now: Date = new Date(),
): string | null {
  if (!earliestWorkout || totalWorkouts <= 0) return null;
  const start = new Date(`${earliestWorkout}T00:00:00Z`);
  const days = (now.getTime() - start.getTime()) / MS_PER_DAY;
  if (days < DAYS_PER_YEAR) return null;
  const perWeek = totalWorkouts / (days / 7);
  const years = Math.floor(days / DAYS_PER_YEAR);
  return `${perWeek.toFixed(1)} a week for ${years} year${years === 1 ? "" : "s"}`;
}

/** "21 per workout" */
export function setsPerWorkoutLine(
  totalSets: number,
  totalWorkouts: number,
): string | null {
  if (totalWorkouts <= 0 || totalSets <= 0) return null;
  return `${Math.round(totalSets / totalWorkouts)} per workout`;
}

/** "≈ 2.5 Eiffel Towers" — hidden below a tenth of a tower. */
export function eiffelTowersLine(totalVolumeLbs: number): string | null {
  const towers = totalVolumeLbs / EIFFEL_TOWER_LBS;
  if (towers < 0.1) return null;
  return `≈ ${towers.toFixed(1)} Eiffel Towers`;
}

/** "≈ 88 full days in the gym" — hidden below one day. */
export function daysInGymLine(totalDurationSeconds: number): string | null {
  const days = Math.round(totalDurationSeconds / 86400);
  if (days < 1) return null;
  return `≈ ${days} full day${days === 1 ? "" : "s"} in the gym`;
}
