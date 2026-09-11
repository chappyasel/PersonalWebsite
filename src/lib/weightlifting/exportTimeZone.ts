import { sql } from "drizzle-orm";

import type { WldWorkout } from "./types";

export const WORKOUT_DATE_POLICY = "pacific-v1";

/**
 * Unedited dates from the July 2026 Pacific backup. Winter and summer
 * references across the history distinguish the two observed export zones.
 * The September Eastern backup moved all 2,281 shared dates forward 3h.
 * Keep these independent of the database, which an old importer may shift.
 */
export const PACIFIC_DATE_REFERENCES = [
  { uuid: "C334B3F5-698E-4F55-8A7D-258D77D9B841", date: "2018-01-31 16:23" },
  { uuid: "B305BDF5-56F3-4191-81BB-3A8B8AE46083", date: "2018-07-31 08:02" },
  { uuid: "7040D6E4-90F0-447E-82F4-710DFAB9F714", date: "2019-01-31 10:18" },
  { uuid: "5CAD941F-F28F-4E8D-9930-59C207D7AB1B", date: "2019-07-29 10:12" },
  { uuid: "5D3CB0E3-5DF2-4081-847D-7E427DF5E137", date: "2022-01-26 17:29" },
  { uuid: "47305964-131D-4267-9A0E-5DFA484AE89A", date: "2022-07-29 02:17" },
  { uuid: "D3B49C2E-99AB-4508-9201-03A566B42D73", date: "2023-01-31 04:58" },
  { uuid: "4696D314-9BBD-4B06-927E-B4ACB84F86E3", date: "2023-07-31 02:43" },
  { uuid: "32601B57-1FFA-49B2-AE0E-937CCEC05843", date: "2025-01-31 06:32" },
  { uuid: "D30D9A79-38DD-467F-8F03-6CBA8A26CF3C", date: "2025-07-31 04:09" },
  { uuid: "495E2D11-1D21-4F80-83C7-83FC717C1156", date: "2026-01-31 08:05" },
  { uuid: "822ED539-E900-4899-884B-86B234DDEF31", date: "2026-07-19 11:27" },
] as const;

export type ExportTimeZone = "America/Los_Angeles" | "America/New_York";

export function getExportTimeZone(
  workouts: Pick<WldWorkout, "uuid" | "date" | "dateModified">[],
): ExportTimeZone {
  const byId = new Map(workouts.map((workout) => [workout.uuid, workout]));
  const offsets = PACIFIC_DATE_REFERENCES.flatMap((reference) => {
    const workout = byId.get(reference.uuid);
    if (!workout || workout.dateModified) return [];
    const timestamp = (date: string) =>
      Date.parse(`${date.replace(" ", "T")}Z`);
    return [
      {
        hours:
          (timestamp(workout.date) - timestamp(reference.date)) / 3_600_000,
        month: reference.date.slice(5, 7),
      },
    ];
  });

  // Require broad agreement before allowing the sync to replace any data.
  const enoughReferences =
    offsets.length >= 6 &&
    offsets.some((offset) => offset.month === "01") &&
    offsets.some((offset) => offset.month === "07");
  if (enoughReferences && offsets.every((offset) => offset.hours === 0)) {
    return "America/Los_Angeles";
  }
  if (enoughReferences && offsets.every((offset) => offset.hours === 3)) {
    return "America/New_York";
  }
  throw new Error(
    "Cannot identify workout export time zone from the reference dates. " +
      "Existing workouts were preserved; verify the backup's export zone before importing.",
  );
}

/**
 * The site's existing date queries read UTC fields as calendar wall time.
 * Store Pacific wall time in those fields, independent of the sync host's
 * zone. PostgreSQL applies historical DST rules before dropping the zone.
 * These are reporting dates, not absolute instants or original local times.
 */
export function pacificWorkoutDate(
  date: string,
  exportTimeZone: ExportTimeZone,
) {
  return sql<Date>`(${date}::timestamp AT TIME ZONE ${exportTimeZone}
    AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'UTC'`;
}
