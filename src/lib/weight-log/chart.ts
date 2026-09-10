import {
  annualWeightAverage,
  bodyFatEstimates,
  weightTrend,
} from "./estimates";
import type { WeightLog } from "./schema";

export const PHASE_COLORS = {
  bulk: "#dc2626",
  cut: "#2563eb",
  maintenance: "#eab308",
  other: "#94a3b8",
};

const DAY = 86_400_000;
export const dayTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const dayString = (time: number) =>
  new Date(time).toISOString().slice(0, 10);

export function trimmedMean(values: readonly (number | null)[]): number | null {
  const sorted = values
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const kept = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
  return kept.length
    ? kept.reduce((sum, value) => sum + value, 0) / kept.length
    : null;
}

export interface WeightPoint {
  date: string;
  time: number;
  phaseId: string | null;
  weekOf: string | null;
  weight: number | null;
  weekly: number | null;
  trailing: number | null;
  annual: number | null;
  trendReadings: number;
  trendInterpolated: boolean;
  projectedWeight: number | null;
  bodyFatMeasured: number | null;
  bodyFatInterpolated: number | null;
  bodyFatExtrapolated: number | null;
  bodyFatProjected: number | null;
  target: number | null;
  originalTarget: number | null;
  excludedFromWeekly: boolean;
  phaseSeries: Record<
    string,
    {
      weekly: number | null;
      target: number | null;
      originalTarget: number | null;
      projection: number | null;
    }
  >;
}

export function buildWeightChart(log: WeightLog): WeightPoint[] {
  const points = new Map<number, WeightPoint>();
  for (const week of log.weeks) {
    const weekly = trimmedMean(
      week.averageDays.map((day) => week.weights[day] ?? null),
    );
    week.weights.forEach((weight, offset) => {
      const time = dayTime(week.date) + offset * DAY;
      const existing = points.get(time);
      // Overlapping phase templates must never erase another phase's readings.
      // Every phase retains its own average and targets for separate chart lines.
      const phaseSeries = {
        ...existing?.phaseSeries,
        [week.phaseId]: {
          weekly,
          target: week.target,
          originalTarget: week.originalTarget,
          projection: null,
        },
      };
      if (existing && weight === null) {
        existing.phaseSeries = phaseSeries;
        return;
      }
      points.set(time, {
        date: dayString(time),
        time,
        phaseId: week.phaseId,
        weekOf: week.date,
        weight,
        weekly,
        trailing: null,
        annual: null,
        trendReadings: 0,
        trendInterpolated: false,
        projectedWeight: null,
        bodyFatMeasured: null,
        bodyFatInterpolated: null,
        bodyFatExtrapolated: null,
        bodyFatProjected: null,
        target: week.target,
        originalTarget: week.originalTarget,
        excludedFromWeekly: !week.averageDays.includes(offset),
        phaseSeries,
      });
    });
  }
  if (!points.size) return [];
  const result: WeightPoint[] = [];
  const first = Math.min(...points.keys());
  const last = Math.max(...points.keys());
  for (let time = first; time <= last; time += DAY) {
    const point = points.get(time) ?? {
      date: dayString(time),
      time,
      phaseId: null,
      weekOf: null,
      weight: null,
      weekly: null,
      trailing: null,
      annual: null,
      trendReadings: 0,
      trendInterpolated: false,
      projectedWeight: null,
      bodyFatMeasured: null,
      bodyFatInterpolated: null,
      bodyFatExtrapolated: null,
      bodyFatProjected: null,
      target: null,
      originalTarget: null,
      excludedFromWeekly: false,
      phaseSeries: {},
    };
    result.push(point);
  }
  const trend = weightTrend(result);
  const annual = annualWeightAverage(result);
  const latestReading = [...result]
    .reverse()
    .find((point) => point.weight !== null)?.time;
  result.forEach((point, index) => {
    point.trailing = trend[index]!.value;
    point.annual = annual[index]!;
    point.trendReadings = trend[index]!.readings;
    point.trendInterpolated = trend[index]!.interpolated;
  });
  // Project only from explicit dated workbook targets, never from a stale last
  // observed slope. Weekly targets interpolate linearly within each phase.
  if (latestReading !== undefined) {
    const resultByTime = new Map(result.map((point) => [point.time, point]));
    for (const phase of [...log.phases].sort((a, b) =>
      a.start.localeCompare(b.start),
    )) {
      const weeks = log.weeks
        .filter((week) => week.phaseId === phase.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      weeks.forEach((week, index) => {
        if (week.target === null) return;
        const next = weeks[index + 1];
        for (let offset = 0; offset < 7; offset++) {
          const time = dayTime(week.date) + offset * DAY;
          if (time < latestReading) continue;
          const point = resultByTime.get(time),
            series = point?.phaseSeries[phase.id];
          if (!point || !series) continue;
          const contiguous =
            next &&
            next.target !== null &&
            dayTime(next.date) - dayTime(week.date) === 7 * DAY;
          const target = contiguous
            ? week.target + ((next.target! - week.target) * offset) / 7
            : week.target;
          series.projection = target;
          point.projectedWeight = target;
        }
      });
    }
  }
  const composition = bodyFatEstimates(result, log.scans);
  result.forEach((point, index) => {
    const estimate = composition[index]!;
    point.bodyFatMeasured = estimate.measured;
    point.bodyFatInterpolated = estimate.interpolated;
    point.bodyFatExtrapolated = estimate.extrapolated;
    point.bodyFatProjected = estimate.projected;
  });
  return result;
}
