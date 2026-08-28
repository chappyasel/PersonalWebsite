// The workout preview's route key: a calendar day (YYYY-MM-DD, possibly
// several workouts) or a single workout's uuid. One segment, discriminated
// by shape, so both launchers share /weightlifting/workout/[key].

export type WorkoutPreviewTarget = { date: string } | { workoutUuid: string };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function workoutPreviewTarget(key: string): WorkoutPreviewTarget {
  return DATE_KEY.test(key) ? { date: key } : { workoutUuid: key };
}

export function workoutPreviewPath(target: WorkoutPreviewTarget) {
  return `/weightlifting/workout/${"date" in target ? target.date : target.workoutUuid}`;
}
