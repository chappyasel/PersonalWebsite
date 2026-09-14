/** Current Pacific calendar month plus the preceding months, through today. */
export function activityCalendarBounds(months: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  const endDate = `${part("year")}-${part("month")}-${part("day")}`;
  const start = new Date(
    Date.UTC(Number(part("year")), Number(part("month")) - months, 1),
  );
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

/** UTC arithmetic preserves date-only keys across visitor time zones and DST. */
export function activityCalendarMonths(endDate: string, count: number) {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const first = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - count + index + 1, 1),
    );
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    return {
      key: first.toISOString().slice(0, 7),
      label: first.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      fullLabel: first.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      days: Array.from({ length: daysInMonth }, (_, day) => ({
        key: `${first.toISOString().slice(0, 7)}-${String(day + 1).padStart(2, "0")}`,
        day: day + 1,
        column: ((offset + day) % 7) + 1,
        row: Math.floor((offset + day) / 7) + 1,
      })),
    };
  });
}
