export type ScoreBand = "low" | "middle" | "high" | "unscored";

/** Shared dashboard grading for headline scores and score aggregates. */
export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return "unscored";
  if (score < 4) return "low";
  if (score < 7) return "middle";
  return "high";
}

export function scoreTextClass(score: number | null): string {
  switch (scoreBand(score)) {
    case "low":
      return "text-red-600 dark:text-red-400";
    case "middle":
      return "text-amber-600 dark:text-amber-400";
    case "high":
      return "text-green-600 dark:text-green-400";
    case "unscored":
      return "text-neutral-400 dark:text-neutral-500";
  }
}

export type InformationDietPeriod = {
  estimatedExposureHours: number;
  learningValue: number | null;
  learningCoverage: number | null;
  positivity: number | null;
  positivityCoverage: number | null;
};

export type SmoothedInformationDietPeriod = {
  estimatedExposureHoursSmoothed: number;
  learningValueSmoothed: number | null;
  learningCoverageSmoothed: number | null;
  positivitySmoothed: number | null;
  positivityCoverageSmoothed: number | null;
};

type Dimension = "learning" | "positivity";

function smoothDimension(
  periods: InformationDietPeriod[],
  start: number,
  end: number,
  dimension: Dimension,
): { score: number | null; coverage: number | null } {
  let totalExposure = 0;
  let scoredExposure = 0;
  let weightedScore = 0;

  for (let index = start; index <= end; index += 1) {
    const period = periods[index]!;
    const score =
      dimension === "learning" ? period.learningValue : period.positivity;
    const coverage =
      dimension === "learning"
        ? period.learningCoverage
        : period.positivityCoverage;
    const exposure = Math.max(0, period.estimatedExposureHours);
    totalExposure += exposure;

    if (score !== null && coverage !== null && coverage > 0) {
      const periodScoredExposure = exposure * Math.min(1, coverage);
      scoredExposure += periodScoredExposure;
      weightedScore += score * periodScoredExposure;
    }
  }

  return {
    score: scoredExposure > 0 ? weightedScore / scoredExposure : null,
    coverage: totalExposure > 0 ? scoredExposure / totalExposure : null,
  };
}

/**
 * Past-only trailing smoothing. A window is measured in displayed periods.
 * Watch time is an arithmetic mean (including zero-watch periods); scores and
 * coverage are reconstructed from exposure represented by accepted scores.
 */
export function smoothInformationDietTrend(
  periods: InformationDietPeriod[],
  window: number,
): SmoothedInformationDietPeriod[] {
  const windowSize = Math.max(1, Math.floor(window));

  return periods.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const periodCount = index - start + 1;
    let exposure = 0;
    for (let cursor = start; cursor <= index; cursor += 1) {
      exposure += periods[cursor]!.estimatedExposureHours;
    }
    const learning = smoothDimension(periods, start, index, "learning");
    const positivity = smoothDimension(periods, start, index, "positivity");

    return {
      estimatedExposureHoursSmoothed: exposure / periodCount,
      learningValueSmoothed: learning.score,
      learningCoverageSmoothed: learning.coverage,
      positivitySmoothed: positivity.score,
      positivityCoverageSmoothed: positivity.coverage,
    };
  });
}
