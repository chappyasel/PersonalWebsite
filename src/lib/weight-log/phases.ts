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
