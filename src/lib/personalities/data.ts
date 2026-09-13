export const traits = [
  "Openness",
  "Conscientiousness",
  "Extraversion",
  "Agreeableness",
  "Neuroticism",
] as const;
export type Trait = (typeof traits)[number];
export type Scores = Record<Trait, number>;
export type Facet = { trait: Trait; name: string; score: number; max: number };
export type Assessment = {
  id: string;
  personId: string;
  takenOn: string | null;
  dateEstimated?: boolean;
  addedAt: string;
  source: string;
  externalResultId: string | null;
  sourceReference: string | null;
  testVersion: string;
  scoreKind: "raw" | "percentile" | "percentage";
  scoreMax: 100 | 120;
  scores: Scores;
  facets: Facet[];
  notes: string;
  importKey?: string | null;
};
export type LibraryPerson = {
  id: string;
  name: string;
  group: "You" | "Friends" | "Family";
  createdAt: string;
  assessments: Assessment[];
};
export type Library = { people: LibraryPerson[] };
export const norms = {
  Openness: { mean: 79.2, sd: 14.4 },
  Conscientiousness: { mean: 85.2, sd: 20.4 },
  Extraversion: { mean: 73.2, sd: 20.4 },
  Agreeableness: { mean: 87.6, sd: 14.4 },
  Neuroticism: { mean: 57.6, sd: 21.6 },
};
export function comparable(a: Assessment) {
  return (
    a.scoreKind === "raw" && a.scoreMax === 120 && a.testVersion === "ipip-120"
  );
}
export function chronological(a: Assessment, b: Assessment) {
  return (
    (b.takenOn ?? "").localeCompare(a.takenOn ?? "") ||
    b.addedAt.localeCompare(a.addedAt) ||
    a.id.localeCompare(b.id)
  );
}
export function dateLabel(value: string | null) {
  if (!value) return "Date unknown";
  if (value.length === 7)
    return new Date(`${value}-01T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
