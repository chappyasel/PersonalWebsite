export type SeriesGroupBy = "day" | "week" | "month" | "quarter";

/** Enumerate period-start keys (YYYY-MM-DD, UTC) from start to end inclusive,
 *  stepping by the group size — used to fill zero-watch gaps in time series so
 *  days with no watching graph as 0 rather than being skipped. */
export function enumeratePeriods(
  start: string,
  end: string,
  groupBy: SeriesGroupBy,
): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  let guard = 0;
  while (d <= endDate && guard++ < 20000) {
    out.push(d.toISOString().slice(0, 10));
    if (groupBy === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (groupBy === "week") d.setUTCDate(d.getUTCDate() + 7);
    else if (groupBy === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 3);
  }
  return out;
}

/**
 * The period keys a chart should plot.
 *
 * The window opens at the selected range's own start, so a 30-day view is 30
 * days wide even when the first watch in it landed on day eleven, and closes
 * at the Coverage Through period — the last one the ingested export can speak
 * for. Every period inside that window is plotted: a stretch with no watching
 * is a real zero. Periods past the boundary are unknown rather than empty, so
 * they stay off the chart entirely instead of drawing as zeros that a later
 * export would contradict.
 */
export function seriesPeriods({
  dataPeriods,
  groupBy,
  rangeStartKey,
  coverageKey,
}: {
  /** Period keys that actually have watch events, ascending. */
  dataPeriods: string[];
  groupBy: SeriesGroupBy;
  /** Start of the selected time range, or null for the full history. */
  rangeStartKey?: string | null;
  /** Period holding the Coverage Through instant, or null when unknown. */
  coverageKey?: string | null;
}): string[] {
  const firstData = dataPeriods[0] ?? null;
  const lastData = dataPeriods[dataPeriods.length - 1] ?? null;

  const start = rangeStartKey ?? firstData;
  // Real data always wins: an export that predates a watch event cannot
  // un-know it, so never let the boundary truncate a period that has rows.
  let end = coverageKey ?? lastData;
  if (lastData && (end === null || end < lastData)) end = lastData;

  if (start === null || end === null || start > end) return dataPeriods;
  return enumeratePeriods(start, end, groupBy);
}
