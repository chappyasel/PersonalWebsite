import {
  type Assessment,
  type LibraryPerson,
  type Scores,
  type Trait,
  chronological,
  comparable,
  traits,
} from "./data";
import { InputError, object, text } from "./validation";

export type SharedResult = {
  label: string;
  takenOn: string | null;
  dateEstimated: boolean;
  testVersion: string;
  scoreKind: Assessment["scoreKind"];
  scoreMax: 100 | 120;
  scores: Scores;
};
export type AnonymousContext = {
  count: number;
  scores: Record<Trait, number[]>;
};
export type SharedSnapshot = {
  version: 1;
  results: SharedResult[];
  anonymous?: AnonymousContext;
};

// Sort each trait independently so no array position identifies a person's profile.
export function anonymousContext(
  people: Pick<LibraryPerson, "id" | "group" | "assessments">[],
  excludedPersonIds: ReadonlySet<string>,
): AnonymousContext {
  const results = people.flatMap((p) => {
    if (excludedPersonIds.has(p.id) || !["Friends", "Family"].includes(p.group))
      return [];
    const latest = p.assessments.filter(comparable).sort(chronological)[0];
    return latest ? [latest] : [];
  });
  return {
    count: results.length,
    scores: Object.fromEntries(
      traits.map((trait) => [
        trait,
        results.map((r) => r.scores[trait]).sort((a, b) => a - b),
      ]),
    ) as Record<Trait, number[]>,
  };
}
export type ShareSummary = {
  id: string;
  labels: string[];
  createdAt: number;
  expiresAt: number | null;
};

export function validateShare(value: unknown) {
  const input = object(value);
  if (
    !Array.isArray(input.results) ||
    input.results.length < 1 ||
    input.results.length > 6
  )
    throw new InputError("Choose between one and six results.");
  const results = input.results.map((value) => {
    const result = object(value);
    return {
      assessmentId: text(result.assessmentId, "assessment", 100),
      label: text(result.label, "display name", 100),
    };
  });
  if (new Set(results.map((r) => r.assessmentId)).size !== results.length)
    throw new InputError("Choose each result only once.");
  if (typeof input.includeDates !== "boolean")
    throw new InputError("Choose whether to include dates.");
  if (
    input.expiresInDays !== null &&
    ![7, 30, 90].includes(input.expiresInDays as number)
  )
    throw new InputError("Choose a valid link expiry.");
  if (
    input.includeAnonymous !== undefined &&
    typeof input.includeAnonymous !== "boolean"
  )
    throw new InputError(
      "Choose whether to include unnamed friends and family.",
    );
  return {
    results,
    includeAnonymous: input.includeAnonymous === true,
    includeDates: input.includeDates,
    expiresInDays: input.expiresInDays as number | null,
  };
}

// Explicit allowlist shared by the preview and server. Never spread a private record.
export function sharedResult(
  a: Assessment,
  label: string,
  includeDates: boolean,
): SharedResult {
  return {
    label,
    takenOn: includeDates ? a.takenOn : null,
    dateEstimated: includeDates && a.dateEstimated === true,
    testVersion: a.testVersion,
    scoreKind: a.scoreKind,
    scoreMax: a.scoreMax,
    scores: Object.fromEntries(
      traits.map((trait) => [trait, a.scores[trait]]),
    ) as Scores,
  };
}
