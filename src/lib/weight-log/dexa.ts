import type { WeightLog } from "./schema";

type Scan = WeightLog["scans"][number];
type LeanScan = Scan & { leanMass: number };

// Matches WeightliftingApp-AnalyzeData/src/dexa/calculations.py.
// Fit before filtering so dates never change the reference trend or intervals.
export function buildDexaAnalysis(scans: Scan[]) {
  const ordered = [...scans].sort((a, b) => a.date.localeCompare(b.date));
  const valid = ordered.filter(
    (scan): scan is LeanScan => scan.leanMass !== null,
  );
  const meanWeight =
    valid.reduce((sum, scan) => sum + scan.weight, 0) / valid.length;
  const meanLean =
    valid.reduce((sum, scan) => sum + scan.leanMass, 0) / valid.length;
  const weightVariation = valid.reduce(
    (sum, scan) => sum + (scan.weight - meanWeight) ** 2,
    0,
  );
  const slope =
    weightVariation > 0
      ? valid.reduce(
          (sum, scan) =>
            sum + (scan.weight - meanWeight) * (scan.leanMass - meanLean),
          0,
        ) / weightVariation
      : null;
  const trend =
    slope === null ? null : { slope, intercept: meanLean - slope * meanWeight };
  const leanVariation = valid.reduce(
    (sum, scan) => sum + (scan.leanMass - meanLean) ** 2,
    0,
  );
  const points = ordered.flatMap((scan, index) => {
    if (scan.leanMass === null) return [];
    const previous = ordered[index - 1];
    const change =
      previous && previous.leanMass !== null
        ? {
            weight: scan.weight - previous.weight,
            lean: scan.leanMass - previous.leanMass,
          }
        : null;
    const direction: "bulk" | "cut" | null =
      !change || change.weight === 0
        ? null
        : change.weight > 0
          ? "bulk"
          : "cut";
    const efficiency =
      change && direction
        ? direction === "bulk"
          ? change.lean / change.weight
          : 1 - change.lean / change.weight
        : null;
    const predicted = trend
      ? trend.slope * scan.weight + trend.intercept
      : null;
    return [
      {
        ...scan,
        leanMass: scan.leanMass,
        number: index + 1,
        direction,
        efficiency,
        predicted,
        residual: predicted === null ? null : scan.leanMass - predicted,
      },
    ];
  });
  const rSquared =
    trend && leanVariation > 0
      ? 1 -
        points.reduce((sum, point) => sum + point.residual! ** 2, 0) /
          leanVariation
      : null;
  const latest = ordered.at(-1);
  // The snapshot lacks explicit BMC. Infer it only from complete mass components,
  // never from the reported body-fat percentage, which may contain an override.
  const remainder =
    latest?.leanMass != null && latest.fatMass !== null
      ? latest.weight - latest.leanMass - latest.fatMass
      : null;
  const boneMass = remainder !== null && remainder > 0 ? remainder : null;
  return { points, trend, rSquared, boneMass, latestDate: latest?.date };
}
