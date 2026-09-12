import { type Scores, traits } from "./data";

export function traitDifferences(
  left: Partial<Scores>,
  right: Partial<Scores>,
) {
  return traits.flatMap((trait) => {
    const a = left[trait],
      b = right[trait];
    return a === undefined ||
      b === undefined ||
      !Number.isFinite(a) ||
      !Number.isFinite(b)
      ? []
      : [{ trait, left: a, right: b, delta: b - a }];
  });
}

/** Month-only assessments get a plotting position, not an invented assessment day. */
export function assessmentTime(date: string | null | undefined) {
  if (!date) return null;
  const time = Date.parse(
    `${date.length === 7 ? date + "-15" : date}T12:00:00Z`,
  );
  return Number.isFinite(time) ? time : null;
}
