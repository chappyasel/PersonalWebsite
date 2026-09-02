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

export type SparklineBar = { date: string; height: number; watched: boolean };

export type BarSparkline = {
  bars: SparklineBar[];
  /** y of the comparison line, or null when there is nothing to compare to. */
  referenceY: number | null;
};

/**
 * Bar geometry for the watch-time sparkline. A zero-watch day still draws, as a
 * 1-unit tick, because an empty day inside the covered window is a reading and
 * not a hole. The scale includes the reference value so a quiet window against
 * a heavy prior month reads as bars huddled under the line, rather than the
 * line vanishing off the top of the box.
 */
export function barSparkline(
  daily: { date: string; hours: number }[],
  { reference = null, viewBoxHeight = 20 }: SparklineOptions = {},
): BarSparkline {
  const tallestDay = Math.max(...daily.map((day) => day.hours), 0);
  // When the comparison line is taller than every bar, give it headroom so it
  // lands inside the plot instead of sitting on the top edge, where it reads
  // as a border rather than a measurement.
  const peak =
    reference != null && reference >= tallestDay && reference > 0
      ? reference * 1.12
      : Math.max(tallestDay, reference ?? 0, 0);
  const bars = daily.map((day) => {
    if (day.hours <= 0 || peak <= 0) {
      return { date: day.date, height: 1, watched: false };
    }
    return {
      date: day.date,
      // A short day still has to be visibly a bar, not a tick.
      height: Math.max(1.5, (day.hours / peak) * viewBoxHeight),
      watched: true,
    };
  });
  return {
    bars,
    referenceY:
      reference == null || peak <= 0
        ? null
        : viewBoxHeight - (reference / peak) * viewBoxHeight,
  };
}

type SparklineOptions = {
  reference?: number | null;
  viewBoxHeight?: number;
};

export type LineSparkline = {
  /** One SVG path per unbroken run of values; gaps stay gaps. */
  segments: string[];
  referenceY: number | null;
};

/**
 * Line geometry for the score sparklines. Scores cluster in a narrow band, so
 * the scale is the range the window actually covers rather than the full 0-10:
 * a flat line across the middle of a fixed axis would hide every move worth
 * seeing. The reference value is inside that range, so the line and the
 * comparison it is drawn against always share a scale.
 */
export function lineSparkline(
  points: (number | null)[],
  {
    reference = null,
    viewBoxHeight = 20,
    viewBoxWidth = 100,
  }: SparklineOptions & { viewBoxWidth?: number } = {},
): LineSparkline {
  const defined = points.filter((value): value is number => value !== null);
  if (defined.length === 0) return { segments: [], referenceY: null };

  const candidates = reference == null ? defined : [...defined, reference];
  const low = Math.min(...candidates);
  const high = Math.max(...candidates);
  // A window that never moved still needs a band to sit in, or every point
  // lands on the same pixel and the divide below blows up.
  const pad = high === low ? 0.5 : (high - low) * 0.15;
  const lo = low - pad;
  const span = high + pad - lo;

  const x = (index: number) =>
    points.length === 1 ? 0 : (index / (points.length - 1)) * viewBoxWidth;
  const y = (value: number) =>
    viewBoxHeight - ((value - lo) / span) * viewBoxHeight;

  const segments: string[] = [];
  let run: string[] = [];
  points.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) segments.push(run.join(" "));
      run = [];
      return;
    }
    const command = run.length === 0 ? "M" : "L";
    run.push(`${command}${x(index).toFixed(2)},${y(value).toFixed(2)}`);
  });
  if (run.length > 0) segments.push(run.join(" "));

  return {
    // A lone point draws nothing as a path, so give it somewhere to go.
    segments: segments.map((segment) =>
      segment.includes("L")
        ? segment
        : `${segment} ${segment.replace("M", "L")}`,
    ),
    referenceY: reference == null ? null : y(reference),
  };
}

export type LatestPercentile = {
  latest: number;
  /** Share of the population at or below the latest value. */
  percentile: number;
  sampleSize: number;
  /** True only when the latest point outright holds the record. Ties do not
   *  count: with a month of zero-watch days, "the lowest" would be one of
   *  twenty equally low readings and would read as news when it is not. */
  isHighest: boolean;
  isLowest: boolean;
};

/**
 * Where the newest point of a series sits within the series itself.
 *
 * The population is whatever is on screen, deliberately: a reader can see the
 * distribution being compared against, and switching the range switches the
 * question to one they can also see. `skip` drops leading points whose trailing
 * average was computed from a partial window, since those are not the same
 * measure as the rest of the line.
 */
export function percentileOfLatest(
  values: (number | null)[],
  {
    skip = 0,
    minimumSample = 5,
  }: { skip?: number; minimumSample?: number } = {},
): LatestPercentile | null {
  const population = values
    .slice(skip)
    .filter((value): value is number => value !== null);
  const latest = population[population.length - 1];
  if (latest === undefined || population.length < minimumSample) return null;
  const atOrBelow = population.filter((value) => value <= latest).length;
  const ties = population.filter((value) => value === latest).length;
  return {
    latest,
    percentile: atOrBelow / population.length,
    sampleSize: population.length,
    isHighest: ties === 1 && latest === Math.max(...population),
    isLowest: ties === 1 && latest === Math.min(...population),
  };
}

/** Say a percentile in whichever direction is the informative one. "Higher
 *  than 7%" is true but buries the point that this was one of the quietest
 *  stretches on record. */
export function describePercentile(
  percentile: number | null | undefined,
  noun: string,
  extremes?: { isHighest?: boolean; isLowest?: boolean },
): string | null {
  if (percentile == null) return null;
  if (extremes?.isHighest) return `the highest of ${noun}`;
  if (extremes?.isLowest) return `the lowest of ${noun}`;
  // Cap the printed figure at 99: a value that rounds to 100 without being the
  // record would otherwise claim to beat itself.
  const above = percentile * 100;
  return above >= 50
    ? `higher than ${Math.min(99, Math.round(above))}% of ${noun}`
    : `lower than ${Math.min(99, Math.round(100 - above))}% of ${noun}`;
}
