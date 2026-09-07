"use client";

import { formatSingleReadDate } from "../lib/format";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";

import {
  computeYearOverYearDelta,
  effectiveDaysInYear,
  monthPeriod,
} from "~/lib/stats/yoy";
import { api } from "~/trpc/react";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";
import { YearHeatmap } from "~/components/ui/year-heatmap";

const chartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--foreground))",
  },
} satisfies ChartConfig;

/** "all" for lifetime stats (chart = one bar per year), or a "YYYY" year */
type Scope = "all" | (string & {});
type Metric = "pages" | "hours" | "books";
type Mode = "total" | "week" | "day";

const METRIC_LABELS: Record<Metric, string> = {
  pages: "Pages",
  hours: "Hours",
  books: "Books",
};

const STAT_LABELS: Record<Metric, string> = {
  pages: "Pages",
  hours: "Listened",
  books: "Books",
};

const MODE_LABELS: Record<Mode, string> = {
  total: "Total",
  week: "/wk",
  day: "/day",
};

const MODE_SUFFIX: Record<Mode, string> = {
  total: "",
  week: "/wk",
  day: "/day",
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Toggle choices persist across popover opens (and reloads) */
function readStoredChoice<T extends string>(
  key: string,
  valid: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(`books-stats-${key}`);
  return valid.includes(stored as T) ? (stored as T) : fallback;
}

function storeChoice(key: string, value: string) {
  try {
    window.localStorage.setItem(`books-stats-${key}`, value);
  } catch {
    // Storage unavailable (private mode) — persistence is best-effort
  }
}

/** Adaptive precision: big numbers stay integers, small rates keep decimals */
function formatNumber(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString();
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function formatMetricValue(metric: Metric, mode: Mode, value: number): string {
  const formatted =
    mode === "total" && metric !== "hours"
      ? Math.round(value).toLocaleString()
      : formatNumber(value);
  return metric === "hours" ? `${formatted}h` : formatted;
}

function formatAxisTick(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Sequential opacity steps for daily wall-clock hours (single-hue ramp) */
function hoursToOpacity(hours: number): number {
  if (hours <= 0) return 0;
  if (hours < 0.5) return 0.25;
  if (hours < 1) return 0.45;
  if (hours < 2) return 0.65;
  if (hours < 3) return 0.82;
  return 1;
}

/** Daily reading heatmap for one year — data + ramp stay books-specific */
function ReadingHeatmap({ year }: { year: string }) {
  const { data: daily } = api.books.getDailyReading.useQuery(
    { year: Number(year) },
    { staleTime: 5 * 60 * 1000 },
  );

  return (
    <YearHeatmap
      year={year}
      days={daily}
      getOpacity={(entry) =>
        entry.wallClockHours > 0 ? hoursToOpacity(entry.wallClockHours) : 0.07
      }
      renderTooltip={(date, entry) => (
        <p>
          {/* Noon anchor keeps the UTC day from shifting in local time */}
          {formatSingleReadDate(`${date}T12:00:00`)}
          {entry &&
            entry.wallClockHours > 0 &&
            `: ${entry.wallClockHours.toFixed(1)}h${
              entry.finishes > 0
                ? ` · finished ${entry.finishes} book${entry.finishes > 1 ? "s" : ""}`
                : ""
            }`}
        </p>
      )}
    />
  );
}

export function ReadingStatsContent({ initialScope }: { initialScope: Scope }) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [metric, setMetric] = useState<Metric>(() =>
    readStoredChoice("metric", ["pages", "hours", "books"], "pages"),
  );
  const [mode, setMode] = useState<Mode>(() =>
    readStoredChoice("mode", ["total", "week", "day"], "total"),
  );

  const updateMetric = (m: Metric) => {
    setMetric(m);
    storeChoice("metric", m);
  };
  const updateMode = (m: Mode) => {
    setMode(m);
    storeChoice("mode", m);
  };

  const { data: analytics } = api.books.getReadingAnalytics.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );

  const stats = useMemo(() => {
    if (!analytics) return null;

    const now = new Date();
    const years = analytics.yearly.map((b) => b.period); // chronological

    if (scope === "all") {
      const points = analytics.yearly.map((bucket) => {
        const yearNum = Number(bucket.period);
        const totalDays = Math.round(
          (Date.UTC(yearNum + 1, 0, 1) - Date.UTC(yearNum, 0, 1)) / MS_PER_DAY,
        );
        const elapsedDays = effectiveDaysInYear(bucket.period, now);
        return {
          label: bucket.period,
          pages: bucket.pages,
          hours: Math.round(bucket.wallClockHours * 10) / 10,
          books: bucket.books,
          days: elapsedDays,
          fraction: elapsedDays / totalDays,
        };
      });
      return {
        years,
        books: analytics.totals.books,
        pages: analytics.totals.pages,
        hours: analytics.totals.wallClockHours,
        days: points.reduce((sum, p) => sum + p.days, 0),
        points,
        delta: null,
        pace: null,
      };
    }

    const isCurrentYear = Number(scope) === now.getUTCFullYear();
    const yearBucket = analytics.yearly.find((b) => b.period === scope);
    const points = MONTH_LABELS.map((month, i) => {
      const bucket = analytics.monthly.find(
        (b) => b.period === monthPeriod(scope, i),
      );
      // Per-week rates divide by elapsed days for the in-progress month so a
      // month that just started isn't shown as artificially slow
      const daysInMonth = new Date(
        Date.UTC(Number(scope), i + 1, 0),
      ).getUTCDate();
      const isCurrentMonth = isCurrentYear && i === now.getUTCMonth();
      const effectiveDays = isCurrentMonth ? now.getUTCDate() : daysInMonth;
      return {
        label: month,
        pages: bucket?.pages ?? 0,
        hours: bucket ? Math.round(bucket.wallClockHours * 10) / 10 : 0,
        books: bucket?.books ?? 0,
        days: Math.max(effectiveDays, 1),
        fraction: Math.max(effectiveDays, 1) / daysInMonth,
      };
    });

    // Linear pace projection for the in-progress year
    const yearNum = Number(scope);
    const totalDaysInYear = Math.round(
      (Date.UTC(yearNum + 1, 0, 1) - Date.UTC(yearNum, 0, 1)) / MS_PER_DAY,
    );
    const yearFraction = effectiveDaysInYear(scope, now) / totalDaysInYear;
    const pace =
      isCurrentYear && yearFraction < 1 && yearBucket
        ? {
            books: Math.round(yearBucket.books / yearFraction),
            pages: Math.round(yearBucket.pages / yearFraction / 100) * 100,
          }
        : null;

    return {
      years,
      books: yearBucket?.books ?? 0,
      pages: yearBucket?.pages ?? 0,
      hours: yearBucket?.wallClockHours ?? 0,
      days: effectiveDaysInYear(scope, now),
      points,
      delta: computeYearOverYearDelta(analytics, scope, (b) => b.pages),
      pace,
    };
  }, [analytics, scope]);

  const chartData = useMemo(
    () =>
      stats?.points.map((p) => {
        const divisor =
          mode === "total" ? 1 : mode === "week" ? p.days / 7 : p.days;
        const value = p[metric] / divisor;
        // Linear extrapolation for in-progress periods (total mode only —
        // per-week/day rates are already normalized)
        const projected =
          mode === "total" && p.fraction < 1 && value > 0
            ? (value * (1 - p.fraction)) / p.fraction
            : 0;
        return { label: p.label, value, projected };
      }) ?? [],
    [stats, metric, mode],
  );

  if (!stats) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Year stepping: oldest year ‹ … › newest year › All Time. "All" sits one
  // step to the right of the newest year rather than being its own control.
  const yearIndex = scope === "all" ? -1 : stats.years.indexOf(scope);
  const newestYear = stats.years[stats.years.length - 1];
  const canStepBack =
    scope === "all" ? stats.years.length > 0 : yearIndex !== 0;
  const canStepForward = scope !== "all";

  const stepBack = () => {
    if (scope === "all" || yearIndex === -1) {
      if (newestYear) setScope(newestYear);
    } else if (yearIndex > 0) {
      setScope(stats.years[yearIndex - 1]!);
    }
  };
  const stepForward = () => {
    if (scope === "all") return;
    if (yearIndex === -1 || yearIndex === stats.years.length - 1) {
      setScope("all");
    } else {
      setScope(stats.years[yearIndex + 1]!);
    }
  };

  const stepperButtonClass =
    "flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={stepperButtonClass}
            onClick={stepBack}
            disabled={!canStepBack}
            aria-label="Previous year"
          >
            <CaretLeftIcon className="size-3" weight="bold" />
          </button>
          <span className="min-w-14 text-center text-sm font-semibold text-foreground">
            {scope === "all" ? "All Time" : scope}
          </span>
          <button
            type="button"
            className={stepperButtonClass}
            onClick={stepForward}
            disabled={!canStepForward}
            aria-label={
              yearIndex === stats.years.length - 1 ? "All time" : "Next year"
            }
          >
            <CaretRightIcon className="size-3" weight="bold" />
          </button>
        </div>
        {stats.delta && (
          <button
            type="button"
            onClick={() => setScope(stats.delta!.prevYear)}
            className={`rounded px-1 text-xs font-medium transition-colors hover:bg-muted ${
              stats.delta.pct >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
            aria-label={`View ${stats.delta.prevYear}`}
          >
            {stats.delta.pct >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(stats.delta.pct).toFixed(0)}% pages {stats.delta.label}
          </button>
        )}
      </div>

      <div className="flex justify-around gap-2">
        {(["books", "pages", "hours"] as const).map((m) => {
          const divisor =
            mode === "total"
              ? 1
              : mode === "week"
                ? stats.days / 7
                : stats.days;
          return (
            <div key={m} className="flex flex-col items-center gap-0.5">
              <span className="text-xl font-semibold text-foreground">
                {formatMetricValue(m, mode, stats[m] / Math.max(divisor, 1))}
              </span>
              <span className="text-xs text-muted-foreground">
                {STAT_LABELS[m]}
                {MODE_SUFFIX[mode]}
              </span>
            </div>
          );
        })}
      </div>

      {stats.pace && (
        <p className="-mt-1 text-center text-xs text-muted-foreground">
          On pace for ~{stats.pace.books} books · ~
          {stats.pace.pages.toLocaleString()} pages
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["total", "week", "day"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateMode(m)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                mode === m
                  ? "bg-foreground/90 text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["pages", "hours", "books"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateMetric(m)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                metric === m
                  ? "bg-foreground/90 text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-24 w-full">
        <BarChart
          data={chartData}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 9 }}
            tickFormatter={(v: string) =>
              scope === "all" ? `'${v.slice(2)}` : (v[0] ?? "")
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            tickCount={3}
            allowDecimals={false}
            width={30}
            tickFormatter={formatAxisTick}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value, name, item) => {
                  if (name === "projected") {
                    if (!value) return null;
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const actual = (item?.payload?.value ?? 0) as number;
                    return (
                      <div className="flex flex-1 justify-between gap-3 leading-none">
                        <span className="text-muted-foreground">Projected</span>
                        <span className="font-mono font-bold tabular-nums text-foreground">
                          {formatMetricValue(
                            metric,
                            mode,
                            actual + (value as number),
                          )}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-1 justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">
                        {METRIC_LABELS[metric]}
                        {MODE_SUFFIX[mode]}
                      </span>
                      <span className="font-mono font-bold tabular-nums text-foreground">
                        {formatMetricValue(metric, mode, value as number)}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="value"
            stackId="a"
            fill="hsl(var(--foreground))"
            fillOpacity={0.85}
            isAnimationActive={false}
            // Square top corners when a projected segment stacks above, so
            // the solid bar meets the ghost flush
            shape={(props: unknown) => {
              const shapeProps = props as React.ComponentProps<
                typeof Rectangle
              > & { payload?: { projected?: number } };
              return (
                <Rectangle
                  {...shapeProps}
                  radius={shapeProps.payload?.projected ? 0 : [3, 3, 0, 0]}
                />
              );
            }}
          />
          {/* Projected remainder for in-progress periods — dashed ghost segment */}
          <Bar
            dataKey="projected"
            stackId="a"
            fill="hsl(var(--foreground))"
            fillOpacity={0.12}
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.35}
            strokeDasharray="3 2"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>

      {scope !== "all" && <ReadingHeatmap year={scope} />}
    </div>
  );
}
