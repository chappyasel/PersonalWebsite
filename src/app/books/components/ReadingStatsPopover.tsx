"use client";

import { formatSingleReadDate } from "../lib/format";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";

import type { ReadingAnalytics } from "~/lib/books/types";
import { api } from "~/trpc/react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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

function monthPeriod(year: string, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
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

/**
 * Pages delta vs the previous year. Completed years compare full-year totals;
 * the current (in-progress) year compares against the previous year up to the
 * same point (full elapsed months + prorated current month) so a half-elapsed
 * year doesn't show a misleading drop.
 */
function computePagesDelta(
  analytics: ReadingAnalytics,
  year: string,
): { pct: number; label: string; prevYear: string } | null {
  const yearNum = Number(year);
  const prevYear = String(yearNum - 1);

  const current = analytics.yearly.find((b) => b.period === year)?.pages ?? 0;

  const now = new Date();
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
      const bucket = analytics.monthly.find(
        (b) => b.period === monthPeriod(prevYear, i),
      );
      if (!bucket) continue;
      previous += i < currentMonth ? bucket.pages : bucket.pages * monthFraction;
    }
    label = `vs ${prevYear} to date`;
  } else {
    previous = analytics.yearly.find((b) => b.period === prevYear)?.pages ?? 0;
    label = `vs ${prevYear}`;
  }

  if (previous <= 0 || current <= 0) return null;
  return { pct: ((current - previous) / previous) * 100, label, prevYear };
}

/** Days elapsed in a period so far — full length for past periods */
function effectiveDaysInYear(year: string, now: Date): number {
  const yearNum = Number(year);
  const yearStart = Date.UTC(yearNum, 0, 1);
  if (yearNum === now.getUTCFullYear()) {
    return Math.floor((now.getTime() - yearStart) / MS_PER_DAY) + 1;
  }
  return Math.round((Date.UTC(yearNum + 1, 0, 1) - yearStart) / MS_PER_DAY);
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

const CELL_GAP_PX = 2;

/** GitHub-style daily reading heatmap strip for one year (Monday rows) */
function YearHeatmap({ year }: { year: string }) {
  const { data: daily } = api.books.getDailyReading.useQuery(
    { year: Number(year) },
    { staleTime: 5 * 60 * 1000 },
  );

  const grid = useMemo(() => {
    const yearNum = Number(year);
    const yearStart = Date.UTC(yearNum, 0, 1);
    const daysInYear = Math.round(
      (Date.UTC(yearNum + 1, 0, 1) - yearStart) / MS_PER_DAY,
    );
    const startOffset = (new Date(yearStart).getUTCDay() + 6) % 7; // Monday = 0
    const totalCells = Math.ceil((startOffset + daysInYear) / 7) * 7;
    const todayMs = Date.now();

    const dayMap = new Map(daily?.map((d) => [d.date, d]) ?? []);

    const cells = Array.from({ length: totalCells }, (_, i) => {
      const dayIndex = i - startOffset;
      if (dayIndex < 0 || dayIndex >= daysInYear) return null; // pad cell
      const dayMs = yearStart + dayIndex * MS_PER_DAY;
      if (dayMs > todayMs) return null; // future day
      const date = new Date(dayMs).toISOString().slice(0, 10);
      const entry = dayMap.get(date);
      return {
        date,
        hours: entry?.wallClockHours ?? 0,
        finishes: entry?.finishes ?? 0,
      };
    });

    // Column index of each month's first day, for the label row
    const monthCols = MONTH_LABELS.map((label, m) => {
      const firstDay = Math.round(
        (Date.UTC(yearNum, m, 1) - yearStart) / MS_PER_DAY,
      );
      return { label, col: Math.floor((startOffset + firstDay) / 7) };
    });

    return { cells, monthCols, weeks: totalCells / 7 };
  }, [daily, year]);

  return (
    <div>
      <div className="relative mb-0.5 h-3">
        {grid.monthCols.map(({ label, col }) => (
          <span
            key={label}
            className="absolute top-0 text-[8px] text-muted-foreground"
            style={{ left: `${(col / grid.weeks) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      {/* Fluid cells: column tracks split the container width so the strip
          never overflows narrow popovers */}
      <TooltipProvider delayDuration={150} skipDelayDuration={100}>
        <div
          className="grid w-full grid-flow-col"
          style={{
            gridTemplateRows: "repeat(7, auto)",
            gridAutoColumns: "1fr",
            gap: CELL_GAP_PX,
          }}
        >
          {grid.cells.map((cell, i) =>
            cell === null ? (
              <div key={i} className="aspect-square w-full" />
            ) : (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className="aspect-square w-full rounded-[1px]"
                    style={{
                      backgroundColor:
                        cell.hours > 0
                          ? `hsl(var(--foreground) / ${hoursToOpacity(cell.hours)})`
                          : "hsl(var(--foreground) / 0.07)",
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {/* Noon anchor keeps the UTC day from shifting in local time */}
                    {formatSingleReadDate(`${cell.date}T12:00:00`)}
                    {cell.hours > 0 &&
                      `: ${cell.hours.toFixed(1)}h${
                        cell.finishes > 0
                          ? ` · finished ${cell.finishes} book${cell.finishes > 1 ? "s" : ""}`
                          : ""
                      }`}
                  </p>
                </TooltipContent>
              </Tooltip>
            ),
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

function ReadingStats({ initialScope }: { initialScope: Scope }) {
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
      delta: computePagesDelta(analytics, scope),
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
            mode === "total" ? 1 : mode === "week" ? stats.days / 7 : stats.days;
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

      {scope !== "all" && <YearHeatmap year={scope} />}
    </div>
  );
}

type ReadingStatsPopoverProps = {
  scope: Scope;
  children: React.ReactNode;
  /** Fully replaces the default dotted-underline trigger styling */
  triggerClassName?: string;
  align?: "start" | "center" | "end";
};

/**
 * Wraps a trigger (year section header or toolbar button): opens on hover
 * (mouse) with a grace period, and on tap/click for touch devices via the
 * regular Popover trigger.
 */
export function ReadingStatsPopover({
  scope,
  children,
  triggerClassName,
  align = "start",
}: ReadingStatsPopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            "cursor-pointer decoration-foreground/30 decoration-dotted underline-offset-8 outline-none hover:underline focus-visible:underline"
          }
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") openNow();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose();
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className="w-[26rem] max-w-[calc(100vw-1.5rem)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") cancelClose();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
      >
        <ReadingStats initialScope={scope} />
      </PopoverContent>
    </Popover>
  );
}
