import { type CompositionInput, fatFreeMass } from "./estimates";
import type { WeightLog } from "./schema";

const DAY = 86_400_000;
const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
type Anchor = { date: string; weight: number; ffm: number };
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Anchored least squares, constrained to a fat-free share in [0, 1].
 * A 5 lb regularization scale shrinks poorly supported slopes toward constant
 * FFM. This is an explicit modeling choice, not a physiological conversion. */
function weightShare(scans: readonly Anchor[]) {
  const anchor = scans[0]!;
  let numerator = 0;
  let denominator = 25;
  for (const scan of scans.slice(1)) {
    const change = scan.weight - anchor.weight;
    numerator += change * (scan.ffm - anchor.ffm);
    denominator += change * change;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

export interface HistoricalBodyFatModel {
  anchor: Anchor;
  share: number;
  shareSpread: number;
  errorMass: number;
  validationCount: number;
  validationMeanError: number;
  validationMaxDays: number;
  validationTypicalDays: number;
}

export function fitHistoricalBodyFat(
  scans: WeightLog["scans"],
): HistoricalBodyFatModel | null {
  const anchors = scans
    .flatMap((scan) => {
      const ffm = fatFreeMass(scan);
      return ffm !== null &&
        Number.isFinite(ffm) &&
        ffm > 0 &&
        ffm <= scan.weight
        ? [{ date: scan.date, weight: scan.weight, ffm }]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(
      (scan, index, sorted) => !index || scan.date !== sorted[index - 1]!.date,
    );
  if (anchors.length < 4) return null;
  const anchor = anchors[0]!;
  if (!anchors.some((scan) => Math.abs(scan.weight - anchor.weight) >= 2))
    return null;
  const share = weightShare(anchors);
  // Backward tests hide each early scan AND all scans before it. Only later
  // scans may fit the slope or supply the anchor; at least three must remain.
  const validation = anchors.slice(0, -3).map((target, index) => {
    const training = anchors.slice(index + 1);
    const next = training[0]!;
    const predicted =
      next.ffm + weightShare(training) * (target.weight - next.weight);
    const error = predicted - target.ffm;
    return {
      error,
      percentError: Math.abs((100 * error) / target.weight),
      days: (timeOf(next.date) - timeOf(target.date)) / DAY,
    };
  });
  const shares = anchors.map((_, index) =>
    weightShare(anchors.filter((__, other) => other !== index)),
  );
  return {
    anchor,
    share,
    shareSpread: Math.max(...shares.map((value) => Math.abs(value - share))),
    // At least two percentage points at the anchor, even with a perfect fit.
    errorMass: Math.max(
      anchor.weight * 0.02,
      Math.sqrt(
        validation.reduce((sum, fold) => sum + fold.error ** 2, 0) /
          validation.length,
      ),
    ),
    validationCount: validation.length,
    validationMeanError:
      validation.reduce((sum, fold) => sum + fold.percentError, 0) /
      validation.length,
    validationMaxDays: Math.max(...validation.map((fold) => fold.days)),
    validationTypicalDays: median(validation.map((fold) => fold.days)),
  };
}

export interface HistoricalBodyFatPoint {
  bodyFatHistorical: number | null;
  bodyFatHistoricalRange: [number, number] | null;
}

/** Exploratory sensitivity band, NOT a confidence or prediction interval.
 * Width combines backward-test error, leave-one-scan-out slope sensitivity,
 * and a chosen square-root widening with distance from the first DEXA.
 * It does not identify past muscle gain or claim calibrated coverage. */
export function historicalBodyFat(
  points: readonly CompositionInput[],
  model: HistoricalBodyFatModel | null,
): HistoricalBodyFatPoint[] {
  const anchorTime = model ? timeOf(model.anchor.date) : NaN;
  const anchorScale = points.find(
    (point) => point.time === anchorTime,
  )?.trailing;
  const offset =
    model && anchorScale != null ? model.anchor.weight - anchorScale : 0;
  return points.map((point) => {
    const empty: HistoricalBodyFatPoint = {
      bodyFatHistorical: null,
      bodyFatHistoricalRange: null,
    };
    if (!model || point.time > anchorTime || point.trailing === null)
      return empty;
    const weight = point.trailing + offset;
    const change = weight - model.anchor.weight;
    const ffm = model.anchor.ffm + model.share * change;
    if (!Number.isFinite(weight) || weight <= 0 || ffm <= 0 || ffm > weight)
      return empty;
    const days = (anchorTime - point.time) / DAY;
    const width =
      model.errorMass * Math.sqrt(1 + days / model.validationTypicalDays) +
      Math.abs(change) * model.shareSpread;
    const value = 100 * (1 - ffm / weight);
    return {
      bodyFatHistorical: value,
      bodyFatHistoricalRange: [
        Math.max(0, value - (100 * width) / weight),
        Math.min(100, value + (100 * width) / weight),
      ],
    };
  });
}
