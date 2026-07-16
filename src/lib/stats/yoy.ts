/**
 * Year-over-year comparison helpers shared by the books and weightlifting
 * stats popovers. Pure functions — no DB access.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function monthPeriod(year: string, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** Days elapsed in a period so far — full length for past periods */
export function effectiveDaysInYear(year: string, now: Date): number {
  const yearNum = Number(year);
  const yearStart = Date.UTC(yearNum, 0, 1);
  if (yearNum === now.getUTCFullYear()) {
    return Math.floor((now.getTime() - yearStart) / MS_PER_DAY) + 1;
  }
  return Math.round((Date.UTC(yearNum + 1, 0, 1) - yearStart) / MS_PER_DAY);
}

/**
 * Metric delta vs the previous year. Completed years compare full-year
 * totals; the current (in-progress) year compares against the previous year
 * up to the same point (full elapsed months + prorated current month) so a
 * half-elapsed year doesn't show a misleading drop.
 */
export function computeYearOverYearDelta<B extends { period: string }>(
  data: { yearly: B[]; monthly: B[] },
  year: string,
  getValue: (bucket: B) => number,
  now: Date = new Date(),
): { pct: number; label: string; prevYear: string } | null {
  const yearNum = Number(year);
  const prevYear = String(yearNum - 1);

  const currentBucket = data.yearly.find((b) => b.period === year);
  const current = currentBucket ? getValue(currentBucket) : 0;

  const isCurrentYear = yearNum === now.getUTCFullYear();

  let previous: number;
  let label: string;
  if (isCurrentYear) {
    const currentMonth = now.getUTCMonth(); // 0-based
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), currentMonth + 1, 0),
    ).getUTCDate();
    const monthFraction = now.getUTCDate() / daysInMonth;

    previous = 0;
    for (let i = 0; i <= currentMonth; i++) {
      const bucket = data.monthly.find(
        (b) => b.period === monthPeriod(prevYear, i),
      );
      if (!bucket) continue;
      previous +=
        i < currentMonth ? getValue(bucket) : getValue(bucket) * monthFraction;
    }
    label = `vs ${prevYear} to date`;
  } else {
    const prevBucket = data.yearly.find((b) => b.period === prevYear);
    previous = prevBucket ? getValue(prevBucket) : 0;
    label = `vs ${prevYear}`;
  }

  if (previous <= 0 || current <= 0) return null;
  return { pct: ((current - previous) / previous) * 100, label, prevYear };
}
