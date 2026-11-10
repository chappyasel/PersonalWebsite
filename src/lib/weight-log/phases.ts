export const PHASE_KINDS = ["bulk", "cut", "maintenance"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

const KIND_WORDS: Record<PhaseKind, string> = {
  bulk: "Bulk",
  cut: "Cut",
  maintenance: "Maintain",
};

const DAY = 86_400_000;

/** Add whole days to an ISO calendar date. */
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}

/** The Monday on or before an ISO calendar date. */
export function weekStartOf(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function monthYear(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const month = day.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${month} '${String(day.getUTCFullYear()).slice(2)}`;
}

/**
 * A phase's name, built from its kind and dates, such as "Bulk Aug '26 -
 * Aug '27". Pass a running phase's plan end (its last week's Sunday) as `end`.
 */
export function phaseName(kind: PhaseKind, start: string, end: string) {
  return `${KIND_WORDS[kind]} ${monthYear(start)} - ${monthYear(end)}`;
}

/**
 * Each phase's cycle number for the owner's phase picker: every phase counted
 * by start date, all kinds together, so the first phase is Cycle 1. This is a
 * provisional reading of "cycle" that the owner has yet to confirm, kept here
 * alone so another reading changes one function.
 */
export function cycleNumbers(
  phases: readonly { id: string; start: string }[],
): Map<string, number> {
  return new Map(
    [...phases]
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
      .map((phase, index) => [phase.id, index + 1]),
  );
}

/** The calendar weeks a phase spans, counting its first and last. */
export function phaseWeekCount(start: string, end: string) {
  return weeksBetween(weekStartOf(start), weekStartOf(end)) + 1;
}

/** Whole weeks from one Monday to another. */
export function weeksBetween(fromMonday: string, toMonday: string) {
  return Math.round(
    (Date.parse(`${toMonday}T00:00:00Z`) -
      Date.parse(`${fromMonday}T00:00:00Z`)) /
      (7 * DAY),
  );
}
