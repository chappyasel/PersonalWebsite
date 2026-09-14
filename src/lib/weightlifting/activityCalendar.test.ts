import { expect, it } from "vitest";

import {
  activityCalendarBounds,
  activityCalendarMonths,
} from "./activityCalendar";

it("uses the Pacific month at midnight boundaries, not the UTC month", () => {
  expect(activityCalendarBounds(12, new Date("2026-10-01T06:59:00Z"))).toEqual({
    startDate: "2025-10-01",
    endDate: "2026-09-30",
  });
  expect(activityCalendarBounds(12, new Date("2026-10-01T07:00:00Z"))).toEqual({
    startDate: "2025-11-01",
    endDate: "2026-10-01",
  });
});

it("includes complete real months, leap day, and six-week calendars", () => {
  const months = activityCalendarMonths("2024-03-15", 12);
  expect(months.flatMap((month) => month.days)).toHaveLength(366);
  expect(months[0]?.key).toBe("2023-04");
  expect(months[10]?.days.at(-1)?.key).toBe("2024-02-29");
  expect(months[11]?.days.at(-1)).toEqual({
    key: "2024-03-31",
    day: 31,
    column: 7,
    row: 5,
  });
  const september = activityCalendarMonths("2024-09-30", 1)[0]!;
  expect(september.days[0]?.column).toBe(7);
  expect(september.days.at(-1)?.row).toBe(6);
  expect(activityCalendarMonths("2025-02-28", 1)[0]?.days).toHaveLength(28);
});
