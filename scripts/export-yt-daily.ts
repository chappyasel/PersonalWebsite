/**
 * Read-only export of daily YouTube watch aggregates, for the correlation work
 * in ~/Desktop/Agents/personal-analytics/analyses/2026-07-29-sleep-score-join/.
 *
 * SELECT only. Writes a CSV outside this repo and touches nothing here.
 *
 *   npx tsx scripts/export-yt-daily.ts [outPath]
 *
 * Dates are bucketed in America/Los_Angeles so they line up with the Apple
 * Health `daily` table and the Dailys score series, both of which are local-date
 * keyed. Bucketing in UTC would shift every evening watch onto the next day.
 */

import "dotenv/config";

import { writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { sql } from "drizzle-orm";

import { db } from "~/server/db";

const DEFAULT_OUT = join(
  homedir(),
  "Desktop/Agents/personal-analytics/analyses/2026-07-29-sleep-score-join/youtube-daily.csv",
);

async function main() {
  const out = process.argv[2] ?? DEFAULT_OUT;

  const rows = await db.execute(sql`
    WITH local AS (
      SELECT
        (watched_at AT TIME ZONE 'America/Los_Angeles')::date       AS day,
        EXTRACT(HOUR FROM watched_at AT TIME ZONE 'America/Los_Angeles') AS hr,
        COALESCE(duration_seconds, 0)                                AS secs,
        llm_quality_score                                            AS q,
        category_id                                                  AS cat
      FROM yt_watch_history
    )
    SELECT
      day::text                                                      AS date,
      COUNT(*)                                                       AS yt_videos,
      ROUND((SUM(secs) / 60.0)::numeric, 1)                          AS yt_minutes,
      ROUND(AVG(q)::numeric, 4)                                      AS yt_quality_mean,
      COUNT(*) FILTER (WHERE q IS NOT NULL)                          AS yt_quality_n,
      COUNT(*) FILTER (WHERE q < 0.34)                               AS yt_lowq_videos,
      ROUND((SUM(secs) FILTER (WHERE q < 0.34) / 60.0)::numeric, 1)  AS yt_lowq_minutes,
      ROUND((SUM(secs) FILTER (WHERE q >= 0.67) / 60.0)::numeric, 1) AS yt_highq_minutes,
      ROUND((SUM(secs) FILTER (WHERE hr >= 9 AND hr < 17) / 60.0)::numeric, 1) AS yt_workhours_min,
      ROUND((SUM(secs) FILTER (WHERE hr >= 21 OR hr < 3) / 60.0)::numeric, 1)  AS yt_latenight_min,
      COUNT(DISTINCT cat)                                            AS yt_categories
    FROM local
    GROUP BY day
    ORDER BY day
  `);

  const data = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? rows;
  const list = data as Record<string, unknown>[];
  if (!list.length) {
    console.error("no rows returned");
    process.exit(1);
  }

  const cols = Object.keys(list[0]!);
  const lines = [cols.join(",")];
  for (const r of list) {
    lines.push(cols.map((c) => (r[c] === null ? "" : String(r[c]))).join(","));
  }
  writeFileSync(out, lines.join("\n") + "\n");

  const days = list.map((r) => String(r.date));
  console.log(`rows: ${list.length}  ${days[0]} .. ${days[days.length - 1]}`);
  console.log(`columns: ${cols.join(", ")}`);
  console.log(`wrote ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
