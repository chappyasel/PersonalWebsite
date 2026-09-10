"use client";

import { useMemo, useState } from "react";

import type { WeightPoint } from "~/lib/weight-log/chart";
import {
  WEIGHT_SCALE_COLORS,
  calendarMonth,
  weightCellStyle,
} from "~/lib/weight-log/presentation";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const control =
  "rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm disabled:opacity-30 dark:border-neutral-700";
const lb = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)} lb`;

export function WeightHistoryCalendar({ points }: { points: WeightPoint[] }) {
  const history = useMemo(() => {
    const readings = points.filter((point) => point.weight !== null);
    const years = readings.map((point) => Number(point.date.slice(0, 4)));
    const weights = readings.map((point) => point.weight!);
    return {
      days: new Map(readings.map((point) => [point.date, point])),
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      min: Math.min(...weights),
      max: Math.max(...weights),
      latest: readings.at(-1),
    };
  }, [points]);
  const [year, setYear] = useState(
    history.latest ? Number(history.latest.date.slice(0, 4)) : 0,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    history.latest?.date ?? null,
  );
  if (!history.latest)
    return (
      <p className="text-sm text-muted-foreground">No weigh-ins to display.</p>
    );
  const selected = selectedDate ? history.days.get(selectedDate) : undefined;
  const bodyFat =
    selected?.bodyFatMeasured ??
    selected?.bodyFatInterpolated ??
    selected?.bodyFatExtrapolated;
  const yearCount = [...history.days.keys()].filter((date) =>
    date.startsWith(`${year}-`),
  ).length;
  function changeYear(next: number) {
    setYear(next);
    setSelectedDate(null);
  }

  return (
    <section
      aria-labelledby="weight-calendar-title"
      className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="weight-calendar-title"
            className="font-rounded text-lg font-medium"
          >
            Full weigh-in history
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {yearCount} weigh-ins in {year}. Select a day for its readings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous year"
            disabled={year <= history.minYear}
            className={control}
            onClick={() => changeYear(year - 1)}
          >
            ←
          </button>
          <select
            aria-label="History year"
            value={year}
            onChange={(event) => changeYear(Number(event.target.value))}
            className={control}
          >
            {Array.from(
              { length: history.maxYear - history.minYear + 1 },
              (_, index) => history.maxYear - index,
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Next year"
            disabled={year >= history.maxYear}
            className={control}
            onClick={() => changeYear(year + 1)}
          >
            →
          </button>
        </div>
      </div>
      <div className="my-5 max-w-md space-y-2">
        <p className="text-xs text-muted-foreground">
          Blue is lower weight, red is higher. One scale across all years,
          independent of the chart filters.
        </p>
        <div
          className="h-3 rounded-full border border-neutral-300"
          style={{
            background: `linear-gradient(to right, ${WEIGHT_SCALE_COLORS.join(", ")})`,
          }}
        />
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{lb(history.min)}</span>
          <span>{lb((history.min + history.max) / 2)}</span>
          <span>{lb(history.max)}</span>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-3 w-3 rounded-sm bg-neutral-100 dark:bg-neutral-800" />
          No weigh-in
        </p>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {months.map((month, index) => {
            const calendar = calendarMonth(year, index);
            return (
              <section key={month} aria-label={`${month} ${year}`}>
                <h3 className="mb-2 font-rounded text-sm font-medium">
                  {month}
                </h3>
                <div
                  className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground"
                  aria-hidden="true"
                >
                  {weekdays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {Array.from({ length: calendar.offset }, (_, blank) => (
                    <span key={`blank-${blank}`} />
                  ))}
                  {calendar.dates.map((date, day) => {
                    const point = history.days.get(date);
                    const label = `${month} ${day + 1}, ${year}: ${point ? lb(point.weight) : "No weigh-in"}`;
                    return point ? (
                      <Tooltip key={date} allowTapFirst>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={label}
                            aria-pressed={date === selectedDate}
                            onClick={() => setSelectedDate(date)}
                            onFocus={() => setSelectedDate(date)}
                            className={`h-8 rounded-md border border-black/10 text-xs tabular-nums transition-shadow hover:ring-2 hover:ring-foreground/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${date === selectedDate ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
                            style={weightCellStyle(
                              point.weight!,
                              history.min,
                              history.max,
                            )}
                          >
                            {point.weight!.toFixed(1)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{label}</p>
                          <p>7-day trend: {lb(point.trailing)}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span
                        key={date}
                        aria-label={label}
                        className="flex h-8 items-center justify-center rounded-md bg-neutral-100 text-xs tabular-nums text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                      ></span>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </TooltipProvider>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="mt-6 min-h-28 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900"
      >
        {selected ? (
          <>
            <p className="text-sm font-medium">
              {new Date(`${selected.date}T00:00:00Z`).toLocaleDateString(
                "en-US",
                { timeZone: "UTC", dateStyle: "long" },
              )}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-3 text-xs">
              {[
                ["Weigh-in", lb(selected.weight)],
                ["Weekly average", lb(selected.weekly)],
                ["Target", lb(selected.target)],
                [
                  "7-day trend",
                  `${lb(selected.trailing)} · ${selected.trendReadings} readings`,
                ],
                [
                  selected.bodyFatMeasured != null
                    ? "DEXA body fat"
                    : "Estimated body fat",
                  bodyFat == null ? "—" : `${bodyFat.toFixed(1)}%`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.excludedFromWeekly && (
              <p className="mt-3 text-xs text-muted-foreground">
                The workbook excludes this reading from its weekly average.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a colored day to see its weight, weekly average, trend, and
            body-fat estimate.
          </p>
        )}
      </div>
    </section>
  );
}
