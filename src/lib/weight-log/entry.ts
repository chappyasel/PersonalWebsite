import { addDays } from "./phases";

/**
 * The weigh-in form's date as the owner reads it: "Today", "Yesterday", or a
 * short date such as "Mon, Jan 7", with the year when it isn't this year.
 */
export function relativeDayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
}

export interface WeighIn {
  date: string;
  pounds: number;
}

/**
 * The weigh-in a new entry starts from: the latest one before `date` that
 * counts toward its weekly average. It looks in `date`'s own calendar week
 * first, then falls back to `before`, the latest such weigh-in ahead of that
 * week. An excluded weigh-in is an outlier, so it never seeds the field.
 */
export function lastWeighInBefore(
  date: string,
  week: {
    week: string;
    weights: readonly (number | null)[];
    excludedDays: readonly number[];
  },
  before: WeighIn | null,
): WeighIn | null {
  for (let day = 6; day >= 0; day--) {
    const dayDate = addDays(week.week, day);
    const pounds = week.weights[day];
    if (
      dayDate < date &&
      pounds !== null &&
      pounds !== undefined &&
      !week.excludedDays.includes(day)
    ) {
      return { date: dayDate, pounds };
    }
  }
  return before;
}
