import { type Assessment, type Facet, type Scores, traits } from "./data";

export class InputError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Expected an object.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new InputError(`Enter a valid ${label}.`);
  return value.trim();
}
export function optionalText(value: unknown, max = 2000): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value, "text", max);
}
export function takenOn(value: unknown): string | null {
  const s = optionalText(value, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(s))
    throw new InputError("Use YYYY-MM-DD or YYYY-MM for the assessment date.");
  const full = s.length === 7 ? `${s}-01` : s;
  const date = new Date(full + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== full ||
    full < "1900-01-01" ||
    full > new Date().toISOString().slice(0, 10)
  )
    throw new InputError("Enter a valid assessment date, no later than today.");
  return s;
}
export function validatePerson(value: unknown) {
  const d = object(value);
  const name = text(d.name, "name", 100);
  const group = d.group;
  if (!["You", "Friends", "Family"].includes(String(group)))
    throw new InputError("Choose a group.");
  return {
    name,
    group: String(group),
    importKey: optionalText(d.importKey, 100),
  };
}
export function validateAssessment(
  value: unknown,
): Omit<Assessment, "id" | "addedAt"> {
  const d = object(value);
  const personId = text(d.personId, "person", 100);
  if (d.dateEstimated !== undefined && typeof d.dateEstimated !== "boolean")
    throw new InputError("Invalid date estimate flag.");
  const scoreKind = d.scoreKind;
  if (!["raw", "percentile", "percentage"].includes(String(scoreKind)))
    throw new InputError("Choose the score format.");
  const scoreMax = d.scoreMax;
  if (scoreMax !== 100 && scoreMax !== 120)
    throw new InputError("Choose a 100 or 120 point scale.");
  if (scoreKind !== "raw" && scoreMax !== 100)
    throw new InputError("Percentages and percentiles use a 100-point scale.");
  const scores = object(d.scores);
  const parsed = {} as Scores;
  for (const t of traits) {
    const n = scores[t];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > scoreMax)
      throw new InputError(`${t} must be between 0 and ${scoreMax}.`);
    parsed[t] = n;
  }
  const testVersion = text(d.testVersion, "test type", 100);
  if (
    testVersion === "ipip-120" &&
    (scoreKind !== "raw" ||
      scoreMax !== 120 ||
      traits.some((t) => !Number.isInteger(parsed[t]) || parsed[t] < 24))
  )
    throw new InputError(
      "IPIP-120 totals must be whole numbers from 24 to 120.",
    );
  const source = text(d.source ?? "manual", "source", 100);
  const externalResultId = optionalText(d.externalResultId, 100);
  if (
    source === "bigfive-test.com" &&
    (!externalResultId || !/^[0-9a-f]{24}$/.test(externalResultId))
  )
    throw new InputError("Invalid Big Five result code.");
  const facets: Facet[] = [];
  if (d.facets !== undefined && d.facets !== null) {
    if (!Array.isArray(d.facets) || d.facets.length > 30)
      throw new InputError("Invalid facet scores.");
    for (const item of d.facets) {
      const f = object(item);
      if (
        !traits.includes(f.trait as (typeof traits)[number]) ||
        typeof f.score !== "number" ||
        typeof f.max !== "number" ||
        !Number.isFinite(f.score) ||
        f.score < 0 ||
        f.score > f.max ||
        f.max !== 20
      )
        throw new InputError("Invalid facet score.");
      facets.push({
        trait: f.trait as Facet["trait"],
        name: text(f.name, "facet name", 100),
        score: f.score,
        max: f.max,
      });
    }
  }
  return {
    personId,
    takenOn: takenOn(d.takenOn),
    dateEstimated: d.dateEstimated === true,
    source,
    externalResultId,
    sourceReference: optionalText(d.sourceReference),
    testVersion,
    scoreKind: scoreKind as Assessment["scoreKind"],
    scoreMax,
    scores: parsed,
    facets,
    notes: optionalText(d.notes, 4000) ?? "",
    importKey: optionalText(d.importKey, 150),
  };
}
export function resultCode(value: unknown): string {
  const s = text(value, "result code", 250);
  if (/^[0-9a-f]{24}$/i.test(s)) return s.toLowerCase();
  try {
    const u = new URL(s);
    const m = /^\/(?:[a-z]{2}\/)?result\/([0-9a-f]{24})\/?$/i.exec(u.pathname);
    if (
      u.protocol === "https:" &&
      u.hostname === "bigfive-test.com" &&
      !u.username &&
      !u.password &&
      !u.port &&
      m
    )
      return m[1]!.toLowerCase();
  } catch {}
  throw new InputError(
    "Enter a 24-character Big Five code or its result link.",
  );
}
