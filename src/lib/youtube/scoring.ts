export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

export type ScoreDimension = "learning_value" | "positivity";

export type LearningValueComponents = {
  depth: number;
  relevance: number;
  durability: number;
};

export type PositivityComponents = {
  positiveAffect: number;
  negativeAffect: number;
  optimism: number;
  arousal: number;
};

export function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

export function isWholeScore(value: number): boolean {
  return Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

/** Formula v1. Timely, rigorous material can remain valuable without being durable. */
export function learningValueScore(
  components: LearningValueComponents,
): number {
  return Math.round(
    clampScore(
      components.depth * 0.45 +
        components.relevance * 0.3 +
        components.durability * 0.25,
    ),
  );
}

/** Formula v1. Arousal is diagnostic and intentionally excluded. */
export function positivityScore(components: PositivityComponents): number {
  const netValence = clampScore(
    5 + 0.5 * (components.positiveAffect - components.negativeAffect),
  );
  return Math.round(clampScore(netValence * 0.7 + components.optimism * 0.3));
}

export type WeightedScoreItem = {
  exposureSeconds: number;
  score: number | null;
};

export function aggregateWeightedScore(items: WeightedScoreItem[]): {
  score: number | null;
  coverage: number | null;
  totalExposureSeconds: number;
} {
  let totalExposureSeconds = 0;
  let scoredExposureSeconds = 0;
  let weightedScore = 0;

  for (const item of items) {
    const exposure = Math.max(0, item.exposureSeconds);
    totalExposureSeconds += exposure;
    if (item.score !== null) {
      scoredExposureSeconds += exposure;
      weightedScore += exposure * item.score;
    }
  }

  return {
    score:
      scoredExposureSeconds > 0 ? weightedScore / scoredExposureSeconds : null,
    coverage:
      totalExposureSeconds > 0
        ? scoredExposureSeconds / totalExposureSeconds
        : null,
    totalExposureSeconds,
  };
}
