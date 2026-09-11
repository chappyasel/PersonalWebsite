export const traits = [
  "Openness",
  "Conscientiousness",
  "Extraversion",
  "Agreeableness",
  "Neuroticism",
] as const;
export type Trait = (typeof traits)[number];
export type ScoreRecord = {
  source: string;
  label: string;
  ref: string;
  scores: Partial<Record<Trait, number>>;
};
export type Person = {
  id: string;
  name: string;
  group: string;
  records: ScoreRecord[];
};
export type Norm = { mean: number; sd: number };
export type Snapshot = {
  people: Person[];
  norms: Record<Trait, Norm>;
  sources: string[];
};
export const traitColors: Record<Trait, string> = {
  Openness: "#9764e0",
  Conscientiousness: "#289fc4",
  Extraversion: "#d49a16",
  Agreeableness: "#319d77",
  Neuroticism: "#dd6279",
};

export function recordFor(person: Person, preference: string) {
  return (
    person.records.find((record) => record.source === preference) ??
    person.records[0]
  );
}

export function zScore(score: number, norm: Norm) {
  return (score - norm.mean) / norm.sd;
}

// Equal weight per trait. Require all five so every person is comparable.
export function aggregateDistance(
  scores: ScoreRecord["scores"],
  norms: Snapshot["norms"],
) {
  let squaredDistance = 0;
  for (const trait of traits) {
    const score = scores[trait];
    const norm = norms[trait];
    if (
      score === undefined ||
      !Number.isFinite(score) ||
      !Number.isFinite(norm.mean) ||
      !Number.isFinite(norm.sd) ||
      norm.sd <= 0
    )
      return undefined;
    squaredDistance += zScore(score, norm) ** 2;
  }
  return Math.sqrt(squaredDistance / traits.length);
}

// Normal CDF approximation, with absolute error below 0.00000015.
export function percentile(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail =
    (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 100 * (z >= 0 ? 1 - tail : tail);
}

export function pctLabel(z: number) {
  return `${percentile(z).toFixed(1)}%`;
}
