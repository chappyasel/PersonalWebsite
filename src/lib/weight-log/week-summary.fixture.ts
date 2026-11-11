import type { WeightLog } from "./schema";

/**
 * A synthetic Weight Log for the week summary and the week card. Every number
 * is invented; none of them is the owner's.
 */
type Week = WeightLog["weeks"][number];

const week = (
  date: string,
  phaseId: string,
  weights: (number | null)[],
  target: number | null,
  originalTarget: number | null = target,
  averageDays = [0, 1, 2, 3, 4, 5, 6],
): Week => ({ date, phaseId, weights, averageDays, target, originalTarget });

const empty = [null, null, null, null, null, null, null];

export const SYNTHETIC_LOG: WeightLog = {
  version: 1,
  importedAt: "2030-02-12",
  sourceModifiedAt: "2030-02-12",
  setPoints: [],
  scans: [],
  phases: [
    {
      id: "1",
      label: "Cut Jan '30 - Jan '30",
      kind: "cut",
      start: "2030-01-07",
      end: "2030-01-20",
    },
    {
      id: "2",
      label: "Bulk Jan '30 - Feb '30",
      kind: "bulk",
      start: "2030-01-21",
      end: "2030-02-17",
    },
  ],
  weeks: [
    // A full week in the cut: seven weigh-ins, trimmed to the middle five.
    week("2030-01-07", "1", [100, 101, 102, 110, 101.5, 100.5, 101], 101),
    week("2030-01-14", "1", [99, 100, null, null, null, null, null], 100),
    // The bulk's first week, so its change crosses a phase boundary.
    week("2030-01-21", "2", [100, 100.4, null, null, null, null, null], 100),
    // Wednesday is excluded.
    week(
      "2030-01-28",
      "2",
      [100.2, 100.6, 130, 100.8, null, null, null],
      100.5,
      null,
      [0, 1, 3, 4, 5, 6],
    ),
    // One weigh-in so far.
    week("2030-02-04", "2", [100.9, null, null, null, null, null, null], 101),
    // A planned week with no weigh-ins yet.
    week("2030-02-11", "2", empty, 101.5),
    // Past the plan's end, so no target.
    week("2030-02-18", "2", [101.5, 101.7, null, null, null, null, null], null),
  ],
};

/**
 * A week whose trimmed mean ends in a hundredths 5: 150.2 and 150.5 average
 * to 150.35, which a double stores as 150.34999... The editor's weekly table
 * shows 150.3, so the line and the card must too.
 */
export const HALF_TENTH_LOG: WeightLog = {
  ...SYNTHETIC_LOG,
  weeks: SYNTHETIC_LOG.weeks.map((item) =>
    item.date === "2030-02-04"
      ? {
          ...item,
          weights: [150.2, 150.5, null, null, null, null, null],
          target: 150,
          originalTarget: 150,
        }
      : item,
  ),
};

const OFFSETS = [0.3, -0.2, 0.5, 0.1, -0.4, 0.2, 0];
const plannedWeeks = (
  phaseId: string,
  start: string,
  count: number,
  target: (index: number) => number,
) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index * 7);
    const goal = Math.round(target(index) * 10) / 10;
    return week(
      date.toISOString().slice(0, 10),
      phaseId,
      OFFSETS.map(
        (offset, day) =>
          Math.round((goal + offset + (index % 3) * 0.1 + day * 0.02) * 10) /
          10,
      ),
      goal,
    );
  });

/**
 * Three phases long enough to fill the card's eleven weeks: a finished cut,
 * a finished bulk, and a running maintenance phase, every week planned and
 * weighed. Tuesday, Jun 11 is left out of its average. `loggedThrough`
 * keeps only the weigh-ins up to a day, as the log stood then.
 */
const WINDOW_WEEKS = [
  ...plannedWeeks("1", "2030-03-04", 8, (index) => 190 - 0.5 * index),
  ...plannedWeeks("2", "2030-04-29", 12, (index) => 186.5 + 0.25 * index),
  ...plannedWeeks("3", "2030-07-22", 6, () => 189.5),
].map((item) =>
  item.date === "2030-06-10"
    ? {
        ...item,
        weights: item.weights.map((weight, day) =>
          day === 1 ? 191.4 : weight,
        ),
        averageDays: [0, 2, 3, 4, 5, 6],
      }
    : item,
);

export const WINDOW_LOG: WeightLog = {
  ...SYNTHETIC_LOG,
  phases: [
    {
      id: "1",
      label: "Cut Mar '30 - Apr '30",
      kind: "cut",
      start: "2030-03-04",
      end: "2030-04-28",
    },
    {
      id: "2",
      label: "Bulk Apr '30 - Jul '30",
      kind: "bulk",
      start: "2030-04-29",
      end: "2030-07-21",
    },
    {
      id: "3",
      label: "Maintenance Jul '30 - Sep '30",
      kind: "maintenance",
      start: "2030-07-22",
      end: "2030-09-01",
    },
  ],
  weeks: WINDOW_WEEKS,
};

/** `WINDOW_LOG` as it stood on `date`, with no weigh-ins after it. */
export function loggedThrough(date: string): WeightLog {
  return {
    ...WINDOW_LOG,
    weeks: WINDOW_LOG.weeks.map((item) => ({
      ...item,
      weights: item.weights.map((weight, day) => {
        const on = new Date(`${item.date}T00:00:00Z`);
        on.setUTCDate(on.getUTCDate() + day);
        return on.toISOString().slice(0, 10) <= date ? weight : null;
      }),
    })),
  };
}
