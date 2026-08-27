"use client";

import { categoryColor } from "../lib/utils";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";

import { computeYearOverYearDelta, effectiveDaysInYear } from "~/lib/stats/yoy";
import { api } from "~/trpc/react";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";
import { YearHeatmap } from "~/components/ui/year-heatmap";

/**
 * The headline training-history section: one bar per year (or per month
 * when a year is stepped into), with volume bars stacked by muscle-group
 * category in the app's colors so the composition of training is visible,
 * not just its size. Grew out of the old header stats popover.
 */

const chartConfig = {
  value: { label: "Value", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

/** "all" for lifetime stats (chart = one bar per year), or a "YYYY" year */
type Scope = "all" | (string & {});
type Metric = "volume" | "hours" | "workouts";
type Mode = "total" | "week" | "day";

const METRIC_LABELS: Record<Metric, string> = {
  volume: "Volume",
  hours: "Hours",
  workouts: "Workouts",
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

/** Toggle choices persist across visits */
function readStoredChoice<T extends string>(
  key: string,
  valid: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(`weightlifting-stats-${key}`);
  return valid.includes(stored as T) ? (stored as T) : fallback;
}

function storeChoice(key: string, value: string) {
  try {
    window.localStorage.setItem(`weightlifting-stats-${key}`, value);
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

/** Compact volume: 56.2M, 120k, 850 */
function formatVolumeShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return formatNumber(value);
}

function formatMetricValue(metric: Metric, mode: Mode, value: number): string {
  if (metric === "volume") return formatVolumeShort(value);
  if (metric === "hours") return `${formatNumber(value)}h`;
  return mode === "total"
    ? Math.round(value).toLocaleString()
    : formatNumber(value);
}

function formatAxisTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Sequential opacity steps for daily training volume (single-hue ramp) */
function volumeToOpacity(volume: number): number {
  if (volume < 5_000) return 0.25; // includes cardio-only days
  if (volume < 10_000) return 0.45;
  if (volume < 17_500) return 0.65;
  if (volume < 25_000) return 0.82;
  return 1;
}

/** Noon anchor keeps the UTC day from shifting in local time */
function formatHeatmapDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Daily training heatmap for one year */
function TrainingHeatmap({ year }: { year: string }) {
  const { data: daily } = api.weightlifting.getDailyTraining.useQuery(
    { year: Number(year) },
    { staleTime: 5 * 60 * 1000 },
  );

  return (
    <YearHeatmap
      year={year}
      days={daily}
      getOpacity={(entry) => volumeToOpacity(entry.volume)}
      renderTooltip={(date, entry) => (
        <p>
          {formatHeatmapDate(date)}
          {entry &&
            `: ${entry.volume.toLocaleString()} lbs · ${entry.workouts} workout${
              entry.workouts > 1 ? "s" : ""
            }`}
        </p>
      )}
    />
  );
}

type ChartPoint = {
  label: string;
  value: number;
  projected: number;
} & Record<string, number | string>;

function StackTooltip({
  active,
  payload,
  metric,
  mode,
  categories,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  metric: Metric;
  mode: Mode;
  categories: string[];
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  const rows =
    metric === "volume"
      ? categories
          .map((cat) => ({ cat, value: Number(data[cat] ?? 0) }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value)
      : [];

  return (
    <div className="min-w-36 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-1 font-semibold text-neutral-700 dark:text-neutral-200">
        {data.label}
      </p>
      {rows.map((row) => (
        <div key={row.cat} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: categoryColor(row.cat) }}
            />
            {row.cat}
          </span>
          <span className="tabular-nums text-neutral-700 dark:text-neutral-200">
            {formatMetricValue(metric, mode, row.value)}
          </span>
        </div>
      ))}
      <div
        className={`flex items-center justify-between gap-4 ${
          rows.length > 0
            ? "mt-1 border-t border-neutral-100 pt-1 dark:border-neutral-700/60"
            : ""
        }`}
      >
        <span className="text-neutral-500 dark:text-neutral-400">
          {METRIC_LABELS[metric]}
          {MODE_SUFFIX[mode]}
        </span>
        <span className="font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
          {formatMetricValue(metric, mode, data.value)}
        </span>
      </div>
      {data.projected > 0 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-400 dark:text-neutral-500">
            Projected
          </span>
          <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatMetricValue(metric, mode, data.value + data.projected)}
          </span>
        </div>
      )}
    </div>
  );
}

export function TrainingOverYears() {
  const [scope, setScope] = useState<Scope>("all");
  const [metric, setMetric] = useState<Metric>(() =>
    readStoredChoice("metric", ["volume", "hours", "workouts"], "volume"),
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

  const { data: analytics } = api.weightlifting.getTrainingAnalytics.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );
  const { data: categoryVolume } = api.weightlifting.getCategoryVolume.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000,
    },
  );

  // Alphabetical stacking order, the app's canonical category order
  const categories = useMemo(
    () =>
      [...new Set((categoryVolume ?? []).map((r) => r.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [categoryVolume],
  );

  /** period ("2023" or "2023-04") → category → volume */
  const catByPeriod = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of categoryVolume ?? []) {
      // Index every month under both its own key and its year's key
      for (const period of [row.period, row.period.slice(0, 4)]) {
        const inner = map.get(period) ?? new Map<string, number>();
        inner.set(row.category, (inner.get(row.category) ?? 0) + row.volume);
        map.set(period, inner);
      }
    }
    return map;
  }, [categoryVolume]);

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
          period: bucket.period,
          volume: bucket.volume,
          hours: Math.round(bucket.hours * 10) / 10,
          workouts: bucket.workouts,
          days: elapsedDays,
          fraction: elapsedDays / totalDays,
        };
      });
      return {
        years,
        workouts: analytics.totals.workouts,
        volume: analytics.totals.volume,
        hours: analytics.totals.hours,
        days: points.reduce((sum, p) => sum + p.days, 0),
        points,
        delta: null,
        pace: null,
      };
    }

    const isCurrentYear = Number(scope) === now.getUTCFullYear();
    const yearBucket = analytics.yearly.find((b) => b.period === scope);
    const points = MONTH_LABELS.map((month, i) => {
      const period = `${scope}-${String(i + 1).padStart(2, "0")}`;
      const bucket = analytics.monthly.find((b) => b.period === period);
      // Per-week rates divide by elapsed days for the in-progress month so a
      // month that just started isn't shown as artificially slow
      const daysInMonth = new Date(
        Date.UTC(Number(scope), i + 1, 0),
      ).getUTCDate();
      const isCurrentMonth = isCurrentYear && i === now.getUTCMonth();
      const effectiveDays = isCurrentMonth ? now.getUTCDate() : daysInMonth;
      return {
        label: month,
        period,
        volume: bucket?.volume ?? 0,
        hours: bucket ? Math.round(bucket.hours * 10) / 10 : 0,
        workouts: bucket?.workouts ?? 0,
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
            workouts: Math.round(yearBucket.workouts / yearFraction),
            volume:
              Math.round(yearBucket.volume / yearFraction / 100_000) * 100_000,
          }
        : null;

    return {
      years,
      workouts: yearBucket?.workouts ?? 0,
      volume: yearBucket?.volume ?? 0,
      hours: yearBucket?.hours ?? 0,
      days: effectiveDaysInYear(scope, now),
      points,
      delta: computeYearOverYearDelta(analytics, scope, (b) => b.volume),
      pace,
    };
  }, [analytics, scope]);

  const chartData: ChartPoint[] = useMemo(
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
        const point: ChartPoint = { label: p.label, value, projected };
        if (metric === "volume") {
          const cats = catByPeriod.get(p.period);
          for (const cat of categories) {
            point[cat] = (cats?.get(cat) ?? 0) / divisor;
          }
        }
        return point;
      }) ?? [],
    [stats, metric, mode, categories, catByPeriod],
  );

  // Legend keeps only categories that meaningfully shape the current scope
  const legendCategories = useMemo(() => {
    if (metric !== "volume") return [];
    const totals = new Map<string, number>();
    let sum = 0;
    for (const point of chartData) {
      for (const cat of categories) {
        const v = Number(point[cat] ?? 0);
        totals.set(cat, (totals.get(cat) ?? 0) + v);
        sum += v;
      }
    }
    return categories.filter((cat) => (totals.get(cat) ?? 0) / sum >= 0.02);
  }, [chartData, categories, metric]);

  if (!stats) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-60 w-full" />
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
    "flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200";

  // The topmost visible stack segment gets the rounded cap
  const topCategoryOf = (point: ChartPoint): string | null => {
    if (point.projected > 0) return null;
    for (let i = categories.length - 1; i >= 0; i--) {
      if (Number(point[categories[i]!] ?? 0) > 0) return categories[i]!;
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={stepperButtonClass}
            onClick={stepBack}
            disabled={!canStepBack}
            aria-label="Previous year"
          >
            <CaretLeftIcon className="size-3.5" weight="bold" />
          </button>
          <span className="min-w-24 text-center font-rounded text-lg font-semibold text-neutral-800 dark:text-neutral-100">
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
            <CaretRightIcon className="size-3.5" weight="bold" />
          </button>
        </div>
        {stats.delta && (
          <button
            type="button"
            onClick={() => setScope(stats.delta!.prevYear)}
            className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700/60 ${
              stats.delta.pct >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
            aria-label={`View ${stats.delta.prevYear}`}
          >
            {stats.delta.pct >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(stats.delta.pct).toFixed(0)}% volume {stats.delta.label}
          </button>
        )}
      </div>

      <div className="flex justify-around gap-2">
        {(["workouts", "volume", "hours"] as const).map((m) => {
          const divisor =
            mode === "total"
              ? 1
              : mode === "week"
                ? stats.days / 7
                : stats.days;
          return (
            <div key={m} className="flex flex-col items-center gap-0.5">
              <span className="font-rounded text-2xl font-bold text-neutral-800 dark:text-neutral-100 md:text-3xl">
                {formatMetricValue(m, mode, stats[m] / Math.max(divisor, 1))}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {METRIC_LABELS[m]}
                {MODE_SUFFIX[mode]}
              </span>
            </div>
          );
        })}
      </div>

      {stats.pace && (
        <p className="-mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
          On pace for ~{stats.pace.workouts} workouts · ~
          {(stats.pace.volume / 1_000_000).toFixed(1)}M lbs
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["total", "week", "day"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700/60"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["volume", "hours", "workouts"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateMetric(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                metric === m
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700/60"
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="18%"
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) =>
              scope === "all" ? `'${v.slice(2)}` : (v[0] ?? "")
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
            tickCount={4}
            allowDecimals={false}
            width={38}
            tickFormatter={formatAxisTick}
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--foreground))", fillOpacity: 0.05 }}
            content={
              <StackTooltip
                metric={metric}
                mode={mode}
                categories={categories}
              />
            }
          />
          {metric === "volume" ? (
            categories.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={categoryColor(cat)}
                isAnimationActive={false}
                shape={(props: unknown) => {
                  const shapeProps = props as React.ComponentProps<
                    typeof Rectangle
                  > & { payload?: ChartPoint };
                  const isTop =
                    shapeProps.payload &&
                    topCategoryOf(shapeProps.payload) === cat;
                  return (
                    <Rectangle
                      {...shapeProps}
                      radius={isTop ? [3, 3, 0, 0] : 0}
                    />
                  );
                }}
              />
            ))
          ) : (
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
          )}
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

      {legendCategories.length > 0 && (
        <div className="-mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {legendCategories.map((cat) => (
            <span
              key={cat}
              className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: categoryColor(cat) }}
              />
              {cat}
            </span>
          ))}
        </div>
      )}

      {scope !== "all" && <TrainingHeatmap year={scope} />}
    </div>
  );
}
