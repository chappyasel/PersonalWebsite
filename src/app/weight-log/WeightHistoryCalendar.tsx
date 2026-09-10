"use client";

import { CalendarDotsIcon } from "@phosphor-icons/react/dist/ssr";
import { memo, useMemo, useRef, useState } from "react";

import type { WeightPoint } from "~/lib/weight-log/chart";
import type { HistoricalBodyFatPoint } from "~/lib/weight-log/historical-body-fat";
import { calendarMonth, weightCellStyle } from "~/lib/weight-log/presentation";

import { Button } from "~/components/ui/button";
import { CollapsibleSection } from "~/components/ui/collapsible-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

type CalendarPoint = WeightPoint & Partial<HistoricalBodyFatPoint>;

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
const lb = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)} lb`;

export const WeightHistoryCalendar = memo(function WeightHistoryCalendar({
  points,
}: {
  points: CalendarPoint[];
}) {
  const history = useMemo(() => {
    const readings = points.filter((point) => point.weight !== null);
    const latest = readings.at(-1);
    const days = points.filter(
      (point) =>
        point.weight !== null ||
        (latest && point.time > latest.time && point.projectedWeight !== null),
    );
    const years = days.map((point) => Number(point.date.slice(0, 4)));
    const weights = readings.map((point) => point.weight!);
    return {
      days: new Map(days.map((point) => [point.date, point])),
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      min: Math.min(...weights),
      max: Math.max(...weights),
      latest,
    };
  }, [points]);
  const [year, setYear] = useState(
    history.latest ? Number(history.latest.date.slice(0, 4)) : 0,
  );
  const [openDate, setOpenDate] = useState<string | null>(null);
  const tapWasOpen = useRef(false);
  if (!history.latest)
    return (
      <p className="text-sm text-muted-foreground">No weigh-ins to display.</p>
    );
  const yearCount = [...history.days.values()].filter(
    (point) => point.weight !== null && point.date.startsWith(`${year}-`),
  ).length;
  function changeYear(next: number) {
    setYear(next);
    setOpenDate(null);
  }

  return (
    <CollapsibleSection
      title="Full weigh-in history"
      icon={<CalendarDotsIcon className="h-5 w-5" weight="bold" />}
      cardClassName="dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{yearCount} weigh-ins</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-label="Previous year"
            disabled={year <= history.minYear}
            onClick={() => changeYear(year - 1)}
          >
            ←
          </Button>
          <Select
            value={String(year)}
            onValueChange={(value) => changeYear(Number(value))}
          >
            <SelectTrigger aria-label="History year" className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ph-no-capture ph-mask font-sans">
              {Array.from(
                { length: history.maxYear - history.minYear + 1 },
                (_, index) => history.maxYear - index,
              ).map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-label="Next year"
            disabled={year >= history.maxYear}
            onClick={() => changeYear(year + 1)}
          >
            →
          </Button>
        </div>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                    const planned = point?.weight === null;
                    const value = point?.weight ?? point?.projectedWeight;
                    const label = `${month} ${day + 1}, ${year}: ${point ? `${planned ? "Planned weight " : ""}${lb(value)}` : "No weigh-in"}`;
                    return point ? (
                      <Tooltip
                        key={date}
                        allowTapFirst
                        open={openDate === date}
                        onOpenChange={(open) =>
                          setOpenDate((current) =>
                            open ? date : current === date ? null : current,
                          )
                        }
                      >
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            aria-label={label}
                            onClick={(event) => event.preventDefault()}
                            onPointerDown={(event) => {
                              if (event.pointerType === "touch")
                                tapWasOpen.current = openDate === date;
                            }}
                            onPointerUp={(event) => {
                              if (event.pointerType !== "touch") return;
                              event.preventDefault();
                              setOpenDate(tapWasOpen.current ? null : date);
                            }}
                            className={`h-8 rounded-md border p-0 text-xs tabular-nums transition-shadow hover:ring-2 hover:ring-foreground/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${planned ? "border-transparent bg-neutral-100 text-neutral-400/60 hover:text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500/70 dark:hover:text-neutral-300" : "border-black/10"} ${date === openDate ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
                            style={
                              planned
                                ? undefined
                                : weightCellStyle(
                                    point.weight!,
                                    history.min,
                                    history.max,
                                  )
                            }
                          >
                            {value!.toFixed(1)}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="ph-no-capture ph-mask min-w-60 max-w-xs p-4 font-sans">
                          <p className="mb-3 text-sm font-medium">
                            {month} {day + 1}, {year}
                          </p>
                          <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-xs">
                            {(planned
                              ? [
                                  ["Planned weight", lb(point.projectedWeight)],
                                  ...(point.bodyFatProjected != null
                                    ? [
                                        [
                                          "Projected body fat",
                                          `${point.bodyFatProjected.toFixed(1)}%`,
                                        ],
                                      ]
                                    : []),
                                ]
                              : [
                                  ["Weigh-in", lb(point.weight)],
                                  ["Weekly average", lb(point.weekly)],
                                  ["Target", lb(point.target)],
                                  ["7-day trend", lb(point.trailing)],
                                  [
                                    "Trend readings",
                                    String(point.trendReadings),
                                  ],
                                  ["12-month average", lb(point.annual)],
                                  [
                                    point.bodyFatMeasured != null
                                      ? "DEXA body fat"
                                      : point.bodyFatHistorical != null
                                        ? "Body fat · exploratory"
                                        : "Estimated body fat",
                                    (() => {
                                      const value =
                                        point.bodyFatMeasured ??
                                        point.bodyFatInterpolated ??
                                        point.bodyFatExtrapolated ??
                                        point.bodyFatHistorical;
                                      return value == null
                                        ? "—"
                                        : `${value.toFixed(1)}%`;
                                    })(),
                                  ],
                                  ...(point.bodyFatHistoricalRange
                                    ? [
                                        [
                                          "Scenario range",
                                          `${point.bodyFatHistoricalRange[0].toFixed(1)}% to ${point.bodyFatHistoricalRange[1].toFixed(1)}%`,
                                        ],
                                      ]
                                    : []),
                                ]
                            ).map(([metric, value]) => (
                              <div key={metric} className="contents">
                                <dt className="text-muted-foreground">
                                  {metric}
                                </dt>
                                <dd className="text-right font-medium tabular-nums">
                                  {value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {point.excludedFromWeekly && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              Excluded from the workbook weekly average.
                            </p>
                          )}
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
    </CollapsibleSection>
  );
});
