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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { QueryErrorFallback } from "./QueryErrorFallback";

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

// Hours stack by day of week: an ordered light-to-dark ramp, Mon -> Sun
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dowColor(index: number): string {
  return `hsl(210, 55%, ${78 - index * 8}%)`;
}

// Workouts stack by time of day, bucketed by each workout's start hour in
// the local time where it was logged. Three hue families read as one day
// arc — night/sky blues for the mornings, honey gold for mid-day, sunset
// coral into dusk plum for the evenings. Adjacent-pair CVD and
// normal-vision separation validated on the light card surface; the gold
// deliberately sits above the usual lightness band (a darker gold read as
// mustard), the same brightness class as the Legs category yellow.
const TOD_LABELS = ["Early Morning", "Morning", "Mid-Day", "Evening", "Dusk"];
const TOD_COLORS = ["#4c5d9e", "#5994cf", "#f2c14e", "#e8703d", "#8e3f5c"];
const TOD_RANGES: Record<string, string> = {
  "Early Morning": "1 – 7 AM",
  Morning: "7 – 11 AM",
  "Mid-Day": "11 AM – 4 PM",
  Evening: "4 – 8 PM",
  Dusk: "8 PM – 1 AM",
};
function todColor(index: number): string {
  return TOD_COLORS[index] ?? TOD_COLORS[0]!;
}

/** Toggle choices persist across visits */
function readStoredChoice<T extends string>(
  key: string,
  valid: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(`weightlifting-stats-${key}`);
    return valid.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback; // storage denied (embedded context, blocked site data)
  }
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
  keys,
  colorFor,
  sublabelFor,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  metric: Metric;
  mode: Mode;
  keys: string[];
  colorFor: (key: string) => string;
  sublabelFor?: (key: string) => string | undefined;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  // Volume sorts by size; the weekday and time-of-day splits keep their
  // natural order
  const rows = keys
    .map((cat) => ({ cat, value: Number(data[cat] ?? 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => (metric === "volume" ? b.value - a.value : 0));

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
              style={{ backgroundColor: colorFor(row.cat) }}
            />
            {row.cat}
            {sublabelFor?.(row.cat) && (
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                {sublabelFor(row.cat)}
              </span>
            )}
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
  // Legend chip under the pointer: its segments light up in the chart and
  // the chip shows that slice's number for the current scope
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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

  const analyticsQuery = api.weightlifting.getTrainingAnalytics.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );
  const categoryQuery = api.weightlifting.getCategoryVolume.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );
  const splitsQuery = api.weightlifting.getTrainingSplits.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const analytics = analyticsQuery.data;
  const categoryVolume = categoryQuery.data;
  const splits = splitsQuery.data;
  const isError =
    analyticsQuery.isError || categoryQuery.isError || splitsQuery.isError;
  // The stacks come from the split queries; rendering before they settle
  // would show empty bars as if the data were zero
  const isSettling =
    !analytics || categoryQuery.isPending || splitsQuery.isPending;

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

  const dowByPeriod = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of splits?.hoursByDow ?? []) {
      const label = DOW_LABELS[row.dow - 1]!;
      for (const period of [row.period, row.period.slice(0, 4)]) {
        const inner = map.get(period) ?? new Map<string, number>();
        inner.set(label, (inner.get(label) ?? 0) + row.hours);
        map.set(period, inner);
      }
    }
    return map;
  }, [splits]);

  const todByPeriod = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of splits?.workoutsByTime ?? []) {
      for (const period of [row.period, row.period.slice(0, 4)]) {
        const inner = map.get(period) ?? new Map<string, number>();
        inner.set(row.bucket, (inner.get(row.bucket) ?? 0) + row.workouts);
        map.set(period, inner);
      }
    }
    return map;
  }, [splits]);

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
      // Elapsed days anchor at the first training week, not January of the
      // first year — summing whole calendar years would dilute the /wk and
      // /day rates and contradict the stat cards next door
      const firstWeek = analytics.weekly[0]?.period;
      const elapsedDays = firstWeek
        ? Math.max(
            1,
            Math.floor(
              (now.getTime() - new Date(`${firstWeek}T00:00:00Z`).getTime()) /
                MS_PER_DAY,
            ) + 1,
          )
        : points.reduce((sum, p) => sum + p.days, 0);
      return {
        years,
        workouts: analytics.totals.workouts,
        volume: analytics.totals.volume,
        hours: analytics.totals.hours,
        days: elapsedDays,
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

  // Which composition the active metric stacks by
  const activeKeys: string[] =
    metric === "volume"
      ? categories
      : metric === "hours"
        ? DOW_LABELS
        : TOD_LABELS;
  const splitByPeriod =
    metric === "volume"
      ? catByPeriod
      : metric === "hours"
        ? dowByPeriod
        : todByPeriod;
  const colorFor = (key: string) =>
    metric === "volume"
      ? categoryColor(key)
      : metric === "hours"
        ? dowColor(DOW_LABELS.indexOf(key))
        : todColor(TOD_LABELS.indexOf(key));

  const chartData: ChartPoint[] = useMemo(
    () =>
      stats?.points.map((p) => {
        const divisor =
          mode === "total" ? 1 : mode === "week" ? p.days / 7 : p.days;
        const point: ChartPoint = { label: p.label, value: 0, projected: 0 };
        const segments = splitByPeriod.get(p.period);
        let segmentSum = 0;
        for (const key of activeKeys) {
          const v = (segments?.get(key) ?? 0) / divisor;
          point[key] = v;
          segmentSum += v;
        }
        // Volume totals come from the workout-grain analytics (UTC months);
        // the hour/workout splits bucket by local time, so their totals must
        // be the segment sums or the stack height would contradict the label
        point.value = metric === "volume" ? p[metric] / divisor : segmentSum;
        // Linear extrapolation for in-progress periods (total mode only —
        // per-week/day rates are already normalized)
        point.projected =
          mode === "total" && p.fraction < 1 && point.value > 0
            ? (point.value * (1 - p.fraction)) / p.fraction
            : 0;
        return point;
      }) ?? [],
    [stats, metric, mode, activeKeys, splitByPeriod],
  );

  // Legend keeps only segments that actually appear; volume additionally
  // drops categories under 2% so rare ones live in the tooltip alone.
  // Totals are RAW segment sums for the visible scope — the hover number
  // divides them by the scope-wide rate divisor, the way the header stats
  // do, because summing per-month rates would not be a rate.
  const { legendKeys, legendTotals } = useMemo(() => {
    const totals = new Map<string, number>();
    let sum = 0;
    for (const p of stats?.points ?? []) {
      const segments = splitByPeriod.get(p.period);
      for (const key of activeKeys) {
        const v = segments?.get(key) ?? 0;
        totals.set(key, (totals.get(key) ?? 0) + v);
        sum += v;
      }
    }
    if (sum === 0) return { legendKeys: [] as string[], legendTotals: totals };
    const floor = metric === "volume" ? 0.02 : 0;
    return {
      legendKeys: activeKeys.filter(
        (key) => (totals.get(key) ?? 0) / sum > floor,
      ),
      legendTotals: totals,
    };
  }, [stats, splitByPeriod, activeKeys, metric]);

  if (isError) {
    return (
      <QueryErrorFallback
        label="training history"
        onRetry={() => {
          void analyticsQuery.refetch();
          void categoryQuery.refetch();
          void splitsQuery.refetch();
        }}
      />
    );
  }

  if (!stats || isSettling) {
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
  const topKeyOf = (point: ChartPoint): string | null => {
    if (point.projected > 0) return null;
    for (let i = activeKeys.length - 1; i >= 0; i--) {
      if (Number(point[activeKeys[i]!] ?? 0) > 0) return activeKeys[i]!;
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
          // Same fractional-week divisor the bars use — clamping to a whole
          // week here would contradict the chart every early January
          const days = Math.max(stats.days, 1);
          const divisor =
            mode === "total" ? 1 : mode === "week" ? days / 7 : days;
          return (
            <div key={m} className="flex flex-col items-center gap-0.5">
              <span className="font-rounded text-2xl font-bold text-neutral-800 dark:text-neutral-100 md:text-3xl">
                {formatMetricValue(m, mode, stats[m] / divisor)}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
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
                keys={activeKeys}
                colorFor={colorFor}
                sublabelFor={
                  metric === "workouts"
                    ? (key) => TOD_RANGES[key]
                    : undefined
                }
              />
            }
          />
          {activeKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={colorFor(key)}
              fillOpacity={hoveredKey && hoveredKey !== key ? 0.25 : 1}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const shapeProps = props as React.ComponentProps<
                  typeof Rectangle
                > & { payload?: ChartPoint };
                const isTop =
                  shapeProps.payload && topKeyOf(shapeProps.payload) === key;
                return (
                  <Rectangle
                    {...shapeProps}
                    radius={isTop ? [3, 3, 0, 0] : 0}
                  />
                );
              }}
            />
          ))}
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

      {legendKeys.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <div className="-mt-1 flex flex-wrap justify-center gap-x-1 gap-y-0.5">
            {legendKeys.map((cat) => {
              // Same aggregate divisor the header stats use for rate modes
              const days = Math.max(stats.days, 1);
              const divisor =
                mode === "total" ? 1 : mode === "week" ? days / 7 : days;
              const isHovered = hoveredKey === cat;
              const range = metric === "workouts" ? TOD_RANGES[cat] : undefined;
              const chip = (
                <button
                  key={cat}
                  type="button"
                  onMouseEnter={() => setHoveredKey(cat)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onFocus={() => setHoveredKey(cat)}
                  onBlur={() => setHoveredKey(null)}
                  className={`flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                    isHovered
                      ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-700/60 dark:text-neutral-200"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(cat) }}
                  />
                  {cat}
                  {isHovered && (
                    <span className="font-medium tabular-nums">
                      {formatMetricValue(
                        metric,
                        mode,
                        (legendTotals.get(cat) ?? 0) / divisor,
                      )}
                    </span>
                  )}
                </button>
              );
              if (!range) return chip;
              return (
                <Tooltip key={cat}>
                  <TooltipTrigger asChild>{chip}</TooltipTrigger>
                  <TooltipContent side="top" className="font-sans">
                    {range}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
      {metric === "workouts" && (
        <p className="-mt-2 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          Bucketed by start time, local to wherever each workout was logged.
        </p>
      )}
    </div>
  );
}
