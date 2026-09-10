import { type CompositionInput, fatFreeMass, fitPartition } from "./estimates";
import type { HistoricalContext, WeightLog } from "./schema";

const DAY = 86_400_000;
const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export interface HistoricalBodyFatModel {
  anchor: { date: string; weight: number; ffm: number };
  context: HistoricalContext;
  phases: WeightLog["phases"];
  partition: ReturnType<typeof fitPartition>;
}

export function fitHistoricalBodyFat(
  scans: WeightLog["scans"],
  context?: HistoricalContext,
  phases: WeightLog["phases"] = [],
): HistoricalBodyFatModel | null {
  if (!context) return null;
  const anchor = [...scans]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((scan) => {
      const ffm = fatFreeMass(scan);
      return ffm !== null &&
        Number.isFinite(ffm) &&
        ffm > 0 &&
        ffm <= scan.weight
        ? [{ date: scan.date, weight: scan.weight, ffm }]
        : [];
    })[0];
  if (!anchor || context.anchor.date >= anchor.date) return null;
  return { anchor, context, phases, partition: fitPartition(scans) };
}

export interface HistoricalBodyFatPoint {
  bodyFatHistorical: number | null;
  bodyFatHistoricalRange: [number, number] | null;
}

/** Reconstruct FFM BETWEEN a recollection and a DEXA, rather than assuming
 * that later body composition applies at the same weight in earlier years.
 * These are conditional scenarios, not a fit with calibrated probabilities.
 * Strength affects timing only; it never converts lifted pounds to muscle. */
export function historicalBodyFat(
  points: readonly CompositionInput[],
  model: HistoricalBodyFatModel | null,
): HistoricalBodyFatPoint[] {
  const empty = (): HistoricalBodyFatPoint => ({
    bodyFatHistorical: null,
    bodyFatHistoricalRange: null,
  });
  if (!model) return points.map(empty);
  const start = timeOf(model.context.anchor.date),
    end = timeOf(model.anchor.date);
  const startWeight = points.find((point) => point.time === start)?.trailing;
  const endWeight = points.find((point) => point.time === end)?.trailing;
  // A recollection without a corresponding weight cannot establish fat-free mass.
  if (startWeight == null || !Number.isFinite(startWeight) || startWeight <= 0)
    return points.map(empty);
  const offset = endWeight == null ? 0 : model.anchor.weight - endWeight;
  const timeline = points.filter(
    (point) => point.time >= start && point.time <= end,
  );
  if (!timeline.length) return points.map(empty);

  const lifts = [...new Set(model.context.strength.map((point) => point.lift))]
    .map((lift) => {
      const readings = model.context.strength
        .filter((point) => point.lift === lift)
        .map((point) => ({ time: timeOf(point.date), value: point.value }));
      const at = (time: number) => {
        const values = readings
          .filter((point) => Math.abs(point.time - time) <= 90 * DAY)
          .map((point) => point.value);
        return values.length >= 3 ? median(values) : null;
      };
      const first = at(start),
        last = at(end);
      // Nearly unchanged or declining endpoint performance cannot time muscle gain.
      return first !== null && last !== null && last > first * 1.05
        ? [{ at, first, last }]
        : [];
    })
    .flat();

  let previousWeight: number | null = null;
  let cycleMass = 0,
    bulkProgress = 0,
    strengthProgress = 0;
  const history = timeline.map((point) => {
    const fraction = clamp((point.time - start) / (end - start));
    // A 28-day mean reduces the amount of water-weight noise assigned to a phase.
    const weights = timeline
      .filter(
        (candidate) =>
          candidate.time <= point.time &&
          candidate.time > point.time - 28 * DAY &&
          candidate.trailing !== null,
      )
      .map((candidate) => candidate.trailing!);
    const smooth = weights.length
      ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length
      : null;
    const phase = model.phases
      .filter(
        (phase) =>
          timeOf(phase.start) <= point.time &&
          point.time <= timeOf(phase.end) + DAY - 1,
      )
      .sort((a, b) => b.start.localeCompare(a.start))[0];
    if (smooth !== null && previousWeight !== null) {
      const change = smooth - previousWeight;
      cycleMass +=
        change * (change >= 0 ? model.partition.bulk : model.partition.cut);
      // Gains during a recorded bulk define a separate possible timing path.
      if (phase?.kind === "bulk") bulkProgress += Math.max(0, change);
    }
    if (smooth !== null) previousWeight = smooth;
    const performances = lifts.flatMap((lift) => {
      const value = lift.at(point.time);
      return value === null
        ? []
        : [
            clamp(
              Math.log(value / lift.first) / Math.log(lift.last / lift.first),
            ),
          ];
    });
    // At least two comparable lifts must be available. Missing coverage falls back to time.
    const supported = performances.length >= 2;
    if (supported)
      strengthProgress = Math.max(strengthProgress, median(performances));
    return {
      point,
      fraction,
      cycleMass,
      bulkProgress,
      strength: supported ? strengthProgress : null,
    };
  });
  const last = history.at(-1)!;
  const low = model.context.anchor.bodyFatLow,
    high = model.context.anchor.bodyFatHigh;
  const results = new Map<number, HistoricalBodyFatPoint>();
  for (const row of history) {
    if (row.point.trailing === null) continue;
    const t = row.fraction;
    // The correction is zero at the recollection, and reaches the scan offset
    // at the DEXA. No fixed multi-year scale offset is imposed at the start.
    const weight = row.point.trailing + offset * t;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const bulk =
      last.bulkProgress > 0 ? row.bulkProgress / last.bulkProgress : t;
    const strength = row.strength ?? t;
    const centralProgress = 0.5 * t + 0.25 * bulk + 0.25 * strength;
    const timings = [
      t,
      Math.sqrt(t),
      t * t,
      0.5 * t + 0.5 * bulk,
      0.5 * t + 0.5 * strength,
      centralProgress,
    ];
    const estimate = (
      bodyFat: number,
      progress: number,
      cycleShare: number,
      scanShift: number,
    ) => {
      const firstFfm = startWeight * (1 - bodyFat / 100);
      const targetFfm = model.anchor.ffm + scanShift;
      const ffm =
        firstFfm +
        progress * (targetFfm - firstFfm) +
        cycleShare * (row.cycleMass - progress * last.cycleMass);
      const value = 100 * (1 - ffm / weight);
      return Number.isFinite(value) && value >= 0 && value <= 100
        ? value
        : null;
    };
    const central = estimate((low + high) / 2, centralProgress, 0.5, 0);
    if (central === null) continue;
    const scenarios = timings.flatMap((progress) =>
      [low, high].flatMap((bodyFat) =>
        [0, 0.5, 1].flatMap((cycleShare) =>
          [-0.02, 0, 0.02].flatMap((shift) => {
            const value = estimate(
              bodyFat,
              progress,
              cycleShare,
              shift * model.anchor.weight,
            );
            return value === null ? [] : [value];
          }),
        ),
      ),
    );
    results.set(row.point.time, {
      bodyFatHistorical: central,
      bodyFatHistoricalRange: [
        Math.min(central, ...scenarios),
        Math.max(central, ...scenarios),
      ],
    });
  }
  return points.map((point) => results.get(point.time) ?? empty());
}
