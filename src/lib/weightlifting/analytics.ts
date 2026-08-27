/**
 * Training analytics computed from workout rows.
 *
 * Pure functions — no DB access — so the logic is unit-testable. Unlike
 * books (whose hours spread across a reading span), workouts are point
 * events: everything is attributed to the workout's UTC day.
 */

export type TrainingRow = {
  date: Date;
  durationSeconds: number;
  /** SUM of set volumes for the workout; 0 for cardio-only workouts */
  volume: number;
  sets: number;
};

export type TrainingBucket = {
  period: string;
  workouts: number;
  volume: number;
  hours: number;
  sets: number;
};

export type TrainingAnalytics = {
  weekly: TrainingBucket[];
  monthly: TrainingBucket[];
  yearly: TrainingBucket[];
  totals: {
    workouts: number;
    volume: number;
    hours: number;
    sets: number;
  };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncate a date to its UTC day start */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** ISO week bucket key: the Monday of the day's week, as YYYY-MM-DD */
function weekKey(dayMs: number): string {
  const dayOfWeek = new Date(dayMs).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(dayMs - daysSinceMonday * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function monthKey(dayMs: number): string {
  return new Date(dayMs).toISOString().slice(0, 7); // YYYY-MM
}

function yearKey(dayMs: number): string {
  return new Date(dayMs).toISOString().slice(0, 4); // YYYY
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/** Bucket workouts into weekly/monthly/yearly totals plus lifetime totals */
export function computeTrainingAnalytics(
  rows: TrainingRow[],
): TrainingAnalytics {
  const weekly = new Map<string, TrainingBucket>();
  const monthly = new Map<string, TrainingBucket>();
  const yearly = new Map<string, TrainingBucket>();

  const totals = { workouts: 0, volume: 0, hours: 0, sets: 0 };

  const accumulate = (
    buckets: Map<string, TrainingBucket>,
    period: string,
    row: TrainingRow,
  ) => {
    const bucket = buckets.get(period) ?? {
      period,
      workouts: 0,
      volume: 0,
      hours: 0,
      sets: 0,
    };
    bucket.workouts += 1;
    bucket.volume += row.volume;
    bucket.hours += row.durationSeconds / 3600;
    bucket.sets += row.sets;
    buckets.set(period, bucket);
  };

  for (const row of rows) {
    const day = utcDay(row.date);
    accumulate(weekly, weekKey(day), row);
    accumulate(monthly, monthKey(day), row);
    accumulate(yearly, yearKey(day), row);

    totals.workouts += 1;
    totals.volume += row.volume;
    totals.hours += row.durationSeconds / 3600;
    totals.sets += row.sets;
  }

  const toSortedBuckets = (buckets: Map<string, TrainingBucket>) =>
    [...buckets.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({
        ...b,
        volume: Math.round(b.volume),
        hours: round(b.hours),
      }));

  return {
    weekly: toSortedBuckets(weekly),
    monthly: toSortedBuckets(monthly),
    yearly: toSortedBuckets(yearly),
    totals: {
      workouts: totals.workouts,
      volume: Math.round(totals.volume),
      hours: round(totals.hours),
      sets: totals.sets,
    },
  };
}
