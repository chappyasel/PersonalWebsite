/**
 * Format raw minutes as "12h 32m", omitting hours when 0 ("45m")
 */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Format book length as "8h 12m · ~304 pages", joining whichever halves are
 * non-null (tilde because page counts are approximate)
 */
export function formatLength(
  audioLengthMin: number | null,
  pageCount: number | null,
): string | null {
  const parts: string[] = [];
  if (audioLengthMin != null) parts.push(formatRuntime(audioLengthMin));
  if (pageCount != null) parts.push(`~${pageCount} pages`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 */
export function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? "th";
}

/**
 * Format a single date as "March 18th '25"
 */
export function formatSingleReadDate(date: string): string {
  const d = new Date(date);
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const day = d.getDate();
  const year = d.toLocaleDateString("en-US", { year: "2-digit" });
  return `${month} ${day}${getOrdinalSuffix(day)} '${year}`;
}

/**
 * Format read dates into a unified display string
 * Same month: "March 12th - 18th '25" (full month name, always spaces)
 * Different months: "Mar 12th - Apr 3rd '25" (short month names)
 */
export function formatReadDates(
  started: string | null,
  finished: string | null,
): string | null {
  if (!started || !finished) return null;

  const startDate = new Date(started);
  const endDate = new Date(finished);

  const startMonthShort = startDate.toLocaleDateString("en-US", {
    month: "short",
  });
  const endMonthShort = endDate.toLocaleDateString("en-US", { month: "short" });
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const year = endDate.toLocaleDateString("en-US", { year: "2-digit" });

  if (startMonthShort === endMonthShort) {
    // Same month: use full month name "March 12th - 18th '25"
    const fullMonth = startDate.toLocaleDateString("en-US", { month: "long" });
    return `${fullMonth} ${startDay}${getOrdinalSuffix(startDay)} - ${endDay}${getOrdinalSuffix(endDay)} '${year}`;
  } else {
    // Different months: use short names "Mar 12th - Apr 3rd '25"
    return `${startMonthShort} ${startDay}${getOrdinalSuffix(startDay)} - ${endMonthShort} ${endDay}${getOrdinalSuffix(endDay)} '${year}`;
  }
}

// Ascending order; array index = ordering rank for section headers
export const RUNTIME_BUCKET_LABELS = [
  "Under 5h",
  "5–10h",
  "10–15h",
  "15–20h",
  "20h+",
] as const;

export const PAGE_BUCKET_LABELS = [
  "Under 200 pages",
  "200–400",
  "400–600",
  "600+",
] as const;

export function getRuntimeBucket(minutes: number | null): string {
  if (minutes == null) return "Unknown";
  const hours = minutes / 60;
  if (hours < 5) return RUNTIME_BUCKET_LABELS[0];
  if (hours < 10) return RUNTIME_BUCKET_LABELS[1];
  if (hours < 15) return RUNTIME_BUCKET_LABELS[2];
  if (hours < 20) return RUNTIME_BUCKET_LABELS[3];
  return RUNTIME_BUCKET_LABELS[4];
}

export function getPageBucket(pages: number | null): string {
  if (pages == null) return "Unknown";
  if (pages < 200) return PAGE_BUCKET_LABELS[0];
  if (pages < 400) return PAGE_BUCKET_LABELS[1];
  if (pages < 600) return PAGE_BUCKET_LABELS[2];
  return PAGE_BUCKET_LABELS[3];
}

/**
 * Compare bucket labels by their position in the labels array.
 * "Unknown" always sorts last regardless of direction.
 */
export function compareBucketLabels(
  labels: readonly string[],
  a: string,
  b: string,
  sortOrder: "asc" | "desc",
): number {
  if (a === "Unknown") return 1;
  if (b === "Unknown") return -1;
  const diff = labels.indexOf(a) - labels.indexOf(b);
  return sortOrder === "desc" ? -diff : diff;
}
