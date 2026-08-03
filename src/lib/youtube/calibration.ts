export type CalibrationCandidate = {
  videoId: string;
  channelKey: string;
  watchedAt: Date;
  durationSeconds: number | null;
  preliminaryScore: number | null;
};

export type EdgeCalibrationCandidate = CalibrationCandidate & {
  edgeBuckets: string[];
};

export type ToneValueCalibrationCandidate = CalibrationCandidate & {
  toneValueBucket: "serious-learning" | "positive-entertainment" | null;
};

export type NearTenCalibrationCandidate = CalibrationCandidate & {
  likelyNearTen: boolean;
};

const EDGE_PATTERNS: Array<[string, RegExp]> = [
  [
    "science-simulation",
    /\b(simulat(?:or|ion)|evolution|experiment|science|physics|mathematics?|biology|psychology)\b/i,
  ],
  [
    "consumer-review",
    /\b(review|tested?|unbox(?:ing)?|hands[- ]on|drop test|comparison|versus|vs\.?|worth it)\b/i,
  ],
  [
    "current-ai-affairs",
    /\b(ai|artificial intelligence|gpt|claude|gemini|model|geopolit\w*|election|government|econom\w*|war|policy|market|crisis)\b/i,
  ],
  [
    "explainer-list",
    /(?:^|[.!?]\s*)(?:why|how|every|what)\b|\bexplained\b|\bthe science (?:of|behind)\b/i,
  ],
  [
    "making-as-entertainment",
    /\b(recipe|cook(?:ing)?|baking?|make|making|build|building|diy|craft|restor(?:e|ation)|recreat(?:e|ion))\b/i,
  ],
  [
    "mixed-affect",
    /\b(scary|terrible|crisis|disaster|fear|blame|problem|hope|solution|comeback|surviv\w*|death|worst|best|amazing|danger\w*)\b/i,
  ],
];

export function calibrationEdgeBuckets(input: {
  title: string | null;
  description: string | null;
  categoryId: number | null;
}): string[] {
  const text = `${input.title ?? ""}\n${input.description ?? ""}`;
  const buckets = EDGE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([name]) => name,
  );
  if (
    input.categoryId === 20 &&
    /\b(tips?|guide|tutorial|explained|how to|strategy|learn|analysis|update|snapshot|mod)\b/i.test(
      text,
    )
  ) {
    buckets.push("gaming-instruction");
  }
  return buckets;
}

const HIGH_LEARNING_TOPIC =
  /\b(ai|artificial intelligence|machine learning|llm|agent\w*|software|programming|developer|data|system design|product|startup|business|company|invest\w*|market|econom\w*|geopolit\w*|government|policy|leadership|organization|psychology|decision|learning|health|fitness|science|physics|biology|engineering|technology)\b/i;
const HIGH_LEARNING_FORMAT =
  /\b(analysis|analyz\w*|lecture|course|tutorial|guide|explained|deep dive|documentary|research|interview|how to|the science|history of|case study|breakdown)\b/i;

/** Metadata-only candidate filter for likely high Learning Value videos. */
export function isLikelyHighLearning(input: {
  title: string | null;
  description: string | null;
  categoryId: number | null;
}): boolean {
  const text = `${input.title ?? ""}\n${input.description ?? ""}`;
  return (
    (HIGH_LEARNING_TOPIC.test(text) && HIGH_LEARNING_FORMAT.test(text)) ||
    (input.categoryId === 27 && HIGH_LEARNING_TOPIC.test(text))
  );
}

export function isLikelyNearTen(input: {
  title: string | null;
  description: string | null;
  categoryId: number | null;
  durationSeconds: number | null;
  preliminaryScore: number | null;
}): boolean {
  return (
    isLikelyHighLearning(input) &&
    (input.durationSeconds ?? 0) >= 1200 &&
    (input.description?.length ?? 0) >= 200 &&
    (input.preliminaryScore ?? 0) >= 7
  );
}

const SERIOUS_TONE =
  /\b(war|crisis|disaster|death|addiction|crime|abuse|depress\w*|disease|collapse|failure|scandal|fear|recession|conflict|concussion|danger\w*|worst|terrible|killed|climate)\b/i;
const POSITIVE_TONE =
  /\b(amazing|best|win|winner|comeback|success|love|beautiful|incredible|awesome|funniest|happy|joy|celebrat\w*|dream|wholesome)\b/i;
const ENTERTAINMENT_FORMAT =
  /\b(gameplay|challenge|highlights?|reaction|prank|music|livestream|speedrun|minecraft|tetris|skate|party|funny|comedy)\b/i;

export function toneValueStressBucket(input: {
  title: string | null;
  description: string | null;
  categoryId: number | null;
}): "serious-learning" | "positive-entertainment" | null {
  const title = input.title ?? "";
  const text = `${title}\n${input.description ?? ""}`;
  if (
    SERIOUS_TONE.test(title) &&
    (HIGH_LEARNING_TOPIC.test(text) || HIGH_LEARNING_FORMAT.test(text))
  ) {
    return "serious-learning";
  }
  if (
    POSITIVE_TONE.test(title) &&
    (ENTERTAINMENT_FORMAT.test(text) ||
      input.categoryId === 20 ||
      input.categoryId === 23 ||
      input.categoryId === 24)
  ) {
    return "positive-entertainment";
  }
  return null;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function durationBand(seconds: number | null): number {
  if (seconds === null || seconds < 600) return 0;
  if (seconds < 3600) return 1;
  return 2;
}

function scoreBand(score: number | null): number {
  if (score === null) return 5;
  return Math.min(4, Math.floor(score / 2));
}

/** Deterministic round-robin sampling across time, duration, and old-score bands. */
export function selectCalibrationVideos(
  candidates: CalibrationCandidate[],
  limit = 200,
): string[] {
  if (limit <= 0) return [];
  const sortedDates = candidates
    .map((candidate) => candidate.watchedAt.getTime())
    .sort((a, b) => a - b);
  const quartileFor = (value: number) => {
    if (sortedDates.length === 0) return 0;
    let low = 0;
    let high = sortedDates.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (sortedDates[middle]! < value) low = middle + 1;
      else high = middle;
    }
    return Math.min(3, Math.floor((low * 4) / sortedDates.length));
  };

  const strata = new Map<string, CalibrationCandidate[]>();
  for (const candidate of candidates) {
    const key = `${scoreBand(candidate.preliminaryScore)}:${durationBand(candidate.durationSeconds)}:${quartileFor(candidate.watchedAt.getTime())}`;
    const bucket = strata.get(key) ?? [];
    bucket.push(candidate);
    strata.set(key, bucket);
  }
  for (const bucket of strata.values()) {
    bucket.sort((a, b) => stableHash(a.videoId) - stableHash(b.videoId));
  }

  const selected: string[] = [];
  const channelCounts = new Map<string, number>();
  const buckets = [...strata.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const channelCap of [2, 4, Number.POSITIVE_INFINITY]) {
    let progressed = true;
    while (selected.length < limit && progressed) {
      progressed = false;
      for (const [, bucket] of buckets) {
        const index = bucket.findIndex(
          (candidate) =>
            (channelCounts.get(candidate.channelKey) ?? 0) < channelCap,
        );
        if (index === -1) continue;
        const [candidate] = bucket.splice(index, 1);
        if (!candidate) continue;
        selected.push(candidate.videoId);
        channelCounts.set(
          candidate.channelKey,
          (channelCounts.get(candidate.channelKey) ?? 0) + 1,
        );
        progressed = true;
        if (selected.length === limit) break;
      }
    }
  }

  return selected;
}

/** Select 75% ambiguous content categories and 25% representative controls. */
export function selectEdgeCalibrationVideos(
  candidates: EdgeCalibrationCandidate[],
  limit = 20,
): string[] {
  if (limit <= 0) return [];
  const edgeTarget = Math.min(limit, Math.round(limit * 0.75));
  const buckets = new Map<string, EdgeCalibrationCandidate[]>();
  for (const candidate of candidates) {
    for (const bucketName of candidate.edgeBuckets) {
      const bucket = buckets.get(bucketName) ?? [];
      bucket.push(candidate);
      buckets.set(bucketName, bucket);
    }
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => stableHash(a.videoId) - stableHash(b.videoId));
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  const channelCounts = new Map<string, number>();
  const orderedBuckets = [...buckets.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const channelCap of [1, 2, Number.POSITIVE_INFINITY]) {
    let progressed = true;
    while (selected.length < edgeTarget && progressed) {
      progressed = false;
      for (const [, bucket] of orderedBuckets) {
        const candidate = bucket.find(
          (item) =>
            !seen.has(item.videoId) &&
            (channelCounts.get(item.channelKey) ?? 0) < channelCap,
        );
        if (!candidate) continue;
        selected.push(candidate.videoId);
        seen.add(candidate.videoId);
        channelCounts.set(
          candidate.channelKey,
          (channelCounts.get(candidate.channelKey) ?? 0) + 1,
        );
        progressed = true;
        if (selected.length === edgeTarget) break;
      }
    }
  }

  const controls = candidates.filter(
    (candidate) =>
      !seen.has(candidate.videoId) && candidate.edgeBuckets.length === 0,
  );
  const fallback = candidates.filter(
    (candidate) => !seen.has(candidate.videoId),
  );
  const controlPool =
    controls.length >= limit - selected.length ? controls : fallback;
  return [
    ...selected,
    ...selectCalibrationVideos(controlPool, limit - selected.length),
  ];
}

/** Balance serious-learning and positive-entertainment cross-axis cases. */
export function selectToneValueStressVideos(
  candidates: ToneValueCalibrationCandidate[],
  limit = 20,
): string[] {
  if (limit <= 0) return [];
  const seriousTarget = Math.ceil(limit / 2);
  const serious = candidates.filter(
    (candidate) => candidate.toneValueBucket === "serious-learning",
  );
  const positive = candidates.filter(
    (candidate) => candidate.toneValueBucket === "positive-entertainment",
  );
  const selected = selectCalibrationVideos(serious, seriousTarget);
  const seen = new Set(selected);
  selected.push(
    ...selectCalibrationVideos(
      positive.filter((candidate) => !seen.has(candidate.videoId)),
      limit - selected.length,
    ),
  );
  if (selected.length < limit) {
    const selectedSet = new Set(selected);
    selected.push(
      ...selectCalibrationVideos(
        candidates.filter(
          (candidate) =>
            candidate.toneValueBucket !== null &&
            !selectedSet.has(candidate.videoId),
        ),
        limit - selected.length,
      ),
    );
  }
  return selected;
}

/** Highest-signal candidates first, capped at two videos per channel. */
export function selectNearTenStressVideos(
  candidates: NearTenCalibrationCandidate[],
  limit = 20,
): string[] {
  if (limit <= 0) return [];
  const ranked = candidates
    .filter((candidate) => candidate.likelyNearTen)
    .sort(
      (a, b) =>
        (b.preliminaryScore ?? 0) - (a.preliminaryScore ?? 0) ||
        (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0) ||
        stableHash(a.videoId) - stableHash(b.videoId),
    );
  const selected: string[] = [];
  const channelCounts = new Map<string, number>();
  for (const channelCap of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const candidate of ranked) {
      if (selected.includes(candidate.videoId)) continue;
      if ((channelCounts.get(candidate.channelKey) ?? 0) >= channelCap) {
        continue;
      }
      selected.push(candidate.videoId);
      channelCounts.set(
        candidate.channelKey,
        (channelCounts.get(candidate.channelKey) ?? 0) + 1,
      );
      if (selected.length === limit) return selected;
    }
  }
  return selected;
}
