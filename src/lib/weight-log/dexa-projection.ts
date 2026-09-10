import type { WeightLog } from "./schema";

const SIMULATIONS = 20_000;
const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

export interface BulkProjection {
  anchor: WeightLog["scans"][number] & { leanMass: number };
  target: number;
  intervals: number;
  blocks: number;
  excluded: number;
  simulations: number;
  lower: number;
  expected: number;
  upper: number;
  lowerFraction: number;
  medianFraction: number;
  upperFraction: number;
}

type ProjectionResult =
  | { projection: BulkProjection; reason: null }
  | { projection: null; reason: string };

// A local seeded generator keeps server rendering, hydration, and filter changes
// identical. Random draws are model samples, never credentials or identifiers.
function randomGenerator() {
  let state = 20260909;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function quantile(sorted: number[], probability: number) {
  const position = (sorted.length - 1) * probability;
  const left = Math.floor(position);
  const fraction = position - left;
  return (
    sorted[left]! * (1 - fraction) + sorted[Math.ceil(position)]! * fraction
  );
}

/** Adapts the analysis repo's block-bootstrap mean plus future-bulk residual.
 * Uses lean soft tissue directly, with the latest scan fixed as the anchor.
 * This conditional model interval is not calibrated 95% real-world coverage.
 */
export function projectDexaBulk(
  scans: readonly WeightLog["scans"][number][],
  target = 240,
): ProjectionResult {
  const ordered = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered.at(-1);
  if (latest?.leanMass == null)
    return {
      projection: null,
      reason:
        "The latest DEXA scan needs a lean-mass measurement to anchor the projection.",
    };
  if (!Number.isFinite(target) || target <= latest.weight)
    return {
      projection: null,
      reason: "The bulk target must be above the latest scan’s bodyweight.",
    };
  if (target - latest.weight > 60)
    return {
      projection: null,
      reason:
        "The target is more than 60 lb beyond the latest scan, outside this model’s projection range.",
    };

  const intervals: { start: number; end: number; fraction: number }[] = [];
  let excluded = 0;
  for (let index = 1; index < ordered.length; index++) {
    const before = ordered[index - 1]!;
    const after = ordered[index]!;
    const gain = after.weight - before.weight;
    if (gain <= 0) continue;
    const days = (time(after.date) - time(before.date)) / DAY;
    if (
      gain < 2 ||
      days <= 0 ||
      days > 365 ||
      before.leanMass === null ||
      after.leanMass === null
    ) {
      excluded++;
      continue;
    }
    // Do not clip observed ratios. Real scan intervals may include lean loss or
    // fat loss during weight gain; clipping would erase that variation.
    intervals.push({
      start: index - 1,
      end: index,
      fraction: (after.leanMass - before.leanMass) / gain,
    });
  }
  const blocks: (typeof intervals)[] = [];
  for (const interval of intervals) {
    const previous = blocks.at(-1);
    if (previous?.at(-1)?.end === interval.start) previous.push(interval);
    else blocks.push([interval]);
  }
  if (intervals.length < 3 || blocks.length < 3)
    return {
      projection: null,
      reason: `A 95% ribbon needs at least 3 usable bulk intervals in 3 separate scan groups. This history has ${intervals.length} intervals in ${blocks.length} groups.`,
    };

  const observedMean =
    intervals.reduce((sum, interval) => sum + interval.fraction, 0) /
    intervals.length;
  const blockSummaries = blocks.map((block) => ({
    count: block.length,
    sum: block.reduce((sum, interval) => sum + interval.fraction, 0),
  }));
  const random = randomGenerator();
  const fractions = Array.from({ length: SIMULATIONS }, () => {
    let sum = 0,
      count = 0;
    let remaining = blocks.length;
    while (remaining-- > 0) {
      const block = blockSummaries[Math.floor(random() * blocks.length)]!;
      sum += block.sum;
      count += block.count;
    }
    // Parameter uncertainty plus one future bulk's deviation, rather than a
    // confidence interval for only the historical mean gain fraction.
    const residual =
      intervals[Math.floor(random() * intervals.length)]!.fraction -
      observedMean;
    return sum / count + residual;
  }).sort((a, b) => a - b);
  const lowerFraction = quantile(fractions, 0.025);
  const medianFraction = quantile(fractions, 0.5);
  const upperFraction = quantile(fractions, 0.975);
  const gain = target - latest.weight;
  const lower = latest.leanMass + lowerFraction * gain;
  const expected = latest.leanMass + medianFraction * gain;
  const upper = latest.leanMass + upperFraction * gain;
  const bone =
    latest.fatMass === null
      ? 0
      : latest.weight - latest.leanMass - latest.fatMass;
  if (lower <= 0 || upper + Math.max(0, bone) >= target)
    return {
      projection: null,
      reason:
        "The fitted interval extends beyond valid body-composition values. A 95% ribbon cannot be shown without clipping the model.",
    };
  if (upper - lower < 0.01)
    return {
      projection: null,
      reason:
        "The usable bulk intervals have too little variation to estimate a meaningful 95% ribbon.",
    };
  return {
    projection: {
      anchor: { ...latest, leanMass: latest.leanMass },
      target,
      intervals: intervals.length,
      blocks: blocks.length,
      excluded,
      simulations: SIMULATIONS,
      lower,
      expected,
      upper,
      lowerFraction,
      medianFraction,
      upperFraction,
    },
    reason: null,
  };
}
