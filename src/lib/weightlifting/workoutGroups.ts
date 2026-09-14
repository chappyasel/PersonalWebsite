/**
 * Partition a workout's exercises into consecutive runs sharing a superset
 * group (already parsed server-side to exercise-order groups). Groups with
 * fewer than 2 members are dropped; runs that end up with a single exercise
 * render as normal cards.
 */
export function partitionWorkoutSupersets<
  T extends { order: number },
>(workout: { supersets: number[][]; exercises: T[] }) {
  const groupByOrder = new Map<number, number>();
  workout.supersets.forEach((orders, groupIndex) => {
    const valid = orders.filter((n) => Number.isInteger(n) && n >= 0);
    if (valid.length < 2) return;
    for (const order of valid) groupByOrder.set(order, groupIndex);
  });

  const runs: { groupId: number | null; exercises: T[] }[] = [];
  for (const exercise of workout.exercises) {
    const groupId = groupByOrder.get(exercise.order) ?? null;
    const last = runs[runs.length - 1];
    if (last && groupId !== null && last.groupId === groupId) {
      last.exercises.push(exercise);
    } else {
      runs.push({ groupId, exercises: [exercise] });
    }
  }
  return runs;
}
