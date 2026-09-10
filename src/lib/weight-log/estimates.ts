import type { WeightLog } from "./schema";

const DAY = 86_400_000;
const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const MAX_TREND_GAP_DAYS = 14;

export interface TrendInput {
  time: number;
  weight: number | null;
}
export interface TrendEstimate {
  value: number | null;
  readings: number;
  interpolated: boolean;
}

/** Arithmetic mean of recorded weigh-ins in (one calendar year ago, today].
 * Partial history is usable; missing days are not filled with invented weights. */
export function annualWeightAverage(points: readonly TrendInput[]) {
  const last =
    [...points].reverse().find((point) => point.weight !== null)?.time ??
    -Infinity;
  let left = 0,
    sum = 0,
    count = 0;
  return points.map((point, index) => {
    const date = new Date(point.time);
    const year = date.getUTCFullYear() - 1;
    const month = date.getUTCMonth();
    const day = Math.min(
      date.getUTCDate(),
      new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    );
    const cutoff = Date.UTC(year, month, day);
    if (point.weight !== null) {
      sum += point.weight;
      count++;
    }
    while (left <= index && points[left]!.time <= cutoff) {
      const weight = points[left++]!.weight;
      if (weight !== null) {
        sum -= weight;
        count--;
      }
    }
    return point.time <= last && count ? sum / count : null;
  });
}

/** Available readings in the trailing calendar week, with one extreme trimmed
 * from each end at n >= 3. Short gaps interpolate between actual trend anchors. */
export function weightTrend(points: readonly TrendInput[]): TrendEstimate[] {
  const result: TrendEstimate[] = points.map(() => ({
    value: null,
    readings: 0,
    interpolated: false,
  }));
  let previous: number | undefined;
  points.forEach((point, index) => {
    if (point.weight === null) return;
    const values: number[] = [];
    for (let cursor = index; cursor >= 0; cursor--) {
      const candidate = points[cursor]!;
      if (point.time - candidate.time >= 7 * DAY) break;
      if (candidate.weight !== null) values.push(candidate.weight);
    }
    values.sort((a, b) => a - b);
    const kept = values.length >= 3 ? values.slice(1, -1) : values;
    const value = kept.reduce((sum, reading) => sum + reading, 0) / kept.length;
    result[index] = { value, readings: values.length, interpolated: false };
    if (
      previous !== undefined &&
      point.time - points[previous]!.time <= MAX_TREND_GAP_DAYS * DAY
    ) {
      const left = result[previous]!;
      const leftTime = points[previous]!.time;
      for (let cursor = previous + 1; cursor < index; cursor++) {
        const fraction =
          (points[cursor]!.time - leftTime) / (point.time - leftTime);
        result[cursor] = {
          value: left.value! + fraction * (value - left.value!),
          readings: Math.min(left.readings, values.length),
          interpolated: true,
        };
      }
    }
    previous = index;
  });
  return result;
}

type Scan = WeightLog["scans"][number];
export const fatFreeMass = (scan: Scan) =>
  scan.bodyFatPercent !== null
    ? scan.weight * (1 - scan.bodyFatPercent / 100)
    : scan.fatMass !== null
      ? scan.weight - scan.fatMass
      : null;
const percentage = (weight: number, ffm: number) => {
  const value = 100 * (1 - ffm / weight);
  return weight > 0 && value >= 0 && value <= 100 ? value : null;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export interface PartitionModel {
  bulk: number;
  cut: number;
  bulkIntervals: number;
  cutIntervals: number;
}

/** Ratios use FFM, including bone, as in the analysis repo's forecast model.
 * Tiny changes, year-long mixed intervals, and ratios outside [0,1] are excluded.
 * Without two usable intervals in a direction, keep FFM constant explicitly. */
export function fitPartition(scans: readonly Scan[]): PartitionModel {
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const bulk: number[] = [],
    cut: number[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const start = sorted[index - 1]!,
      end = sorted[index]!;
    const before = fatFreeMass(start),
      after = fatFreeMass(end);
    const change = end.weight - start.weight;
    const days = (timeOf(end.date) - timeOf(start.date)) / DAY;
    if (
      before === null ||
      after === null ||
      Math.abs(change) < 2 ||
      days <= 0 ||
      days > 365
    )
      continue;
    const ratio = (after - before) / change;
    if (ratio < 0 || ratio > 1) continue;
    (change > 0 ? bulk : cut).push(ratio);
  }
  return {
    bulk: bulk.length >= 2 ? median(bulk) : 0,
    cut: cut.length >= 2 ? median(cut) : 0,
    bulkIntervals: bulk.length,
    cutIntervals: cut.length,
  };
}

export interface CompositionInput {
  time: number;
  trailing: number | null;
  projectedWeight: number | null;
}
export interface CompositionEstimate {
  measured: number | null;
  interpolated: number | null;
  extrapolated: number | null;
  projected: number | null;
}

/** Retrospective interpolation blends FFM in time, then uses smoothed scale
 * weight corrected to hit each scan's weight. After the last scan, apply the
 * learned gain/loss partition to observed weight or the explicit future plan.
 * These are visualization heuristics, not measured daily body composition. */
export function bodyFatEstimates(
  points: readonly CompositionInput[],
  scans: readonly Scan[],
): CompositionEstimate[] {
  const anchors = [...scans]
    .filter((scan) => fatFreeMass(scan) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const model = fitPartition(anchors);
  const byTime = new Map(points.map((point) => [point.time, point]));
  const scaleAt = (scan: Scan) =>
    byTime.get(timeOf(scan.date))?.trailing ?? scan.weight;
  const latest = anchors.at(-1);
  return points.map((point) => {
    const result: CompositionEstimate = {
      measured: null,
      interpolated: null,
      extrapolated: null,
      projected: null,
    };
    if (!latest) return result;
    const measured = anchors.find((scan) => timeOf(scan.date) === point.time);
    if (measured)
      result.measured = percentage(measured.weight, fatFreeMass(measured)!);
    const rightIndex = anchors.findIndex(
      (scan) => timeOf(scan.date) >= point.time,
    );
    if (rightIndex > 0 && point.trailing !== null) {
      const left = anchors[rightIndex - 1]!,
        right = anchors[rightIndex]!;
      const fraction =
        (point.time - timeOf(left.date)) /
        (timeOf(right.date) - timeOf(left.date));
      const ffm =
        fatFreeMass(left)! +
        fraction * (fatFreeMass(right)! - fatFreeMass(left)!);
      const offset =
        (left.weight - scaleAt(left)) * (1 - fraction) +
        (right.weight - scaleAt(right)) * fraction;
      result.interpolated = percentage(point.trailing + offset, ffm);
    }
    if (result.measured !== null) result.interpolated = result.measured;
    if (point.time > timeOf(latest.date)) {
      const offset = latest.weight - scaleAt(latest);
      const estimate = (weight: number) => {
        const corrected = weight + offset;
        const change = corrected - latest.weight;
        const ffm =
          fatFreeMass(latest)! +
          change * (change >= 0 ? model.bulk : model.cut);
        return percentage(corrected, ffm);
      };
      if (point.trailing !== null)
        result.extrapolated = estimate(point.trailing);
      if (point.projectedWeight !== null)
        result.projected = estimate(point.projectedWeight);
    }
    return result;
  });
}
