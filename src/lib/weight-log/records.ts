import { zonedDate } from "~/lib/booking/zones";
import type {
  weightLogBodyFatRecollections,
  weightLogPhases,
  weightLogPlannedWeeks,
  weightLogScans,
  weightLogSetPoints,
  weightLogStrengthHistory,
  weightLogWeighIns,
} from "~/server/db/schema";

import { type PhaseKind, addDays, phaseName, weekStartOf } from "./phases";
import { type WeightLog, weightLogSchema } from "./schema";

/** Every Weight Log table row, as read from the database. */
export interface WeightLogRecords {
  weighIns: (typeof weightLogWeighIns.$inferSelect)[];
  phases: (typeof weightLogPhases.$inferSelect)[];
  plannedWeeks: (typeof weightLogPlannedWeeks.$inferSelect)[];
  setPoints: (typeof weightLogSetPoints.$inferSelect)[];
  scans: (typeof weightLogScans.$inferSelect)[];
  recollections: (typeof weightLogBodyFatRecollections.$inferSelect)[];
  strength: (typeof weightLogStrengthHistory.$inferSelect)[];
}

const UNASSIGNED = "unassigned";

/**
 * The owner's time zone, which dates the public "Updated" line. The site's
 * other owner-facing dates (books, YouTube, /meet) use the same zone.
 */
export const OWNER_TIME_ZONE = "America/Los_Angeles";
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Build the public chart's DTO from the tables. Phase names are derived, and a
 * running phase ends with its plan's last week. A weigh-in outside every
 * planned week still appears, in a week with no target.
 */
export function buildWeightLog(records: WeightLogRecords): WeightLog {
  const plannedByPhase = new Map<number, string[]>();
  for (const week of records.plannedWeeks) {
    const list = plannedByPhase.get(week.phaseId) ?? [];
    list.push(week.weekStart);
    plannedByPhase.set(week.phaseId, list);
  }
  const phases = [...records.phases]
    .sort((a, b) => byString(a.startDate, b.startDate))
    .map((phase) => {
      const lastWeek = (plannedByPhase.get(phase.id) ?? [])
        .sort(byString)
        .at(-1);
      const end = phase.endDate ?? addDays(lastWeek ?? phase.startDate, 6);
      return {
        id: String(phase.id),
        label: phaseName(phase.kind as PhaseKind, phase.startDate, end),
        kind: phase.kind as PhaseKind,
        start: phase.startDate,
        end,
      };
    });
  const running = new Set(
    records.phases
      .filter((phase) => phase.endDate === null)
      .map((phase) => String(phase.id)),
  );

  const weighIns = new Map(records.weighIns.map((row) => [row.date, row]));
  const weekRows = new Map(
    records.plannedWeeks.map((week) => [
      week.weekStart,
      {
        phaseId: String(week.phaseId),
        target: week.target,
        originalTarget: week.originalTarget,
      },
    ]),
  );
  // Decision 7: a weigh-in belongs to whichever phase covers its date.
  for (const { date } of records.weighIns) {
    const weekStart = weekStartOf(date);
    if (weekRows.has(weekStart)) continue;
    const phase = phases
      .filter(
        (item) =>
          item.start <= date && (running.has(item.id) || date <= item.end),
      )
      .at(-1);
    weekRows.set(weekStart, {
      phaseId: phase?.id ?? UNASSIGNED,
      target: null,
      originalTarget: null,
    });
  }

  const weeks = [...weekRows]
    .sort(([a], [b]) => byString(a, b))
    .map(([date, week]) => {
      const days = Array.from({ length: 7 }, (_, offset) =>
        weighIns.get(addDays(date, offset)),
      );
      return {
        date,
        phaseId: week.phaseId,
        weights: days.map((day) => day?.pounds ?? null),
        averageDays: days.flatMap((day, offset) =>
          day?.excluded ? [] : [offset],
        ),
        target: week.target,
        originalTarget: week.originalTarget,
      };
    });

  const updatedAt = records.weighIns.reduce(
    (latest, row) => Math.max(latest, row.updatedAt.getTime()),
    0,
  );
  // The DTO reaches the public page, so it carries the day of the latest
  // change and never the time of day the owner saved it.
  const updatedOn = zonedDate(updatedAt, OWNER_TIME_ZONE);
  const recollection = [...records.recollections].sort((a, b) =>
    byString(a.date, b.date),
  )[0];

  return weightLogSchema.parse({
    version: 1,
    // The tables replace the imported snapshot, so "imported" now means the
    // date of the most recent weigh-in change.
    importedAt: updatedOn,
    sourceModifiedAt: updatedOn,
    historicalContext: recollection && {
      anchor: {
        date: recollection.date,
        bodyFatLow: recollection.bodyFatLow,
        bodyFatHigh: recollection.bodyFatHigh,
        note: recollection.note,
      },
      strength: [...records.strength]
        .sort((a, b) => byString(a.date, b.date) || byString(a.lift, b.lift))
        .map(({ date, lift, value }) => ({ date, lift, value })),
    },
    setPoints: [...records.setPoints]
      .sort((a, b) => a.position - b.position)
      .map((point) => ({
        label: `Set point ${point.position}`,
        weight: point.pounds,
      })),
    phases,
    weeks,
    scans: [...records.scans]
      .sort((a, b) => byString(a.date, b.date))
      .map((scan) => ({
        date: scan.date,
        weight: scan.weight,
        leanMass: scan.leanMass,
        fatMass: scan.fatMass,
        bodyFatPercent: scan.bodyFatPercent,
      })),
  });
}
