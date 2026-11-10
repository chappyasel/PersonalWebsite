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
