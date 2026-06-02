"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "~/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { api } from "~/trpc/react";
import { TimeRangeToggle, type TimeRange } from "./TimeRangeToggle";

const chartConfig = {
  avgHoursPerDay: {
    label: "Hrs/day",
    color: "hsl(0 72% 51%)", // red-600
  },
  productivityPct: {
    label: "Quality %",
    color: "hsl(217 91% 60%)", // blue-500
  },
} satisfies ChartConfig;

type GroupBy = "day" | "week" | "month" | "quarter";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
];

/** 0 = no smoothing. */
const SMOOTHING_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "None" },
  { value: 3, label: "3" },
  { value: 7, label: "7" },
  { value: 14, label: "14" },
  { value: 30, label: "30" },
];

/** Centered simple moving average. Even windows are slightly forward-biased.
 * Partial window at edges (no nulls). */
function sma(values: number[], window: number): number[] {
  const halfBefore = Math.floor((window - 1) / 2);
  const halfAfter = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - halfBefore);
    const end = Math.min(values.length, i + halfAfter + 1);
    const slice = values.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Null-aware centered SMA — skips nulls (no-watch days) in each window so the
 * quality average isn't dragged down by days with nothing watched. */
function smaNullable(
  values: (number | null)[],
  window: number,
): (number | null)[] {
  const halfBefore = Math.floor((window - 1) / 2);
  const halfAfter = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - halfBefore);
    const end = Math.min(values.length, i + halfAfter + 1);
    const slice = values
      .slice(start, end)
      .filter((v): v is number => v != null);
    if (slice.length === 0) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function formatPeriod(dateStr: string, groupBy: GroupBy) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (groupBy === "quarter") {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  }
  if (groupBy === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function WatchTimeChart() {
  const [groupBy, setGroupBy] = useState<GroupBy>("month");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [smoothingWindow, setSmoothingWindow] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { data, isLoading } = api.youtube.getWatchTimeOverTime.useQuery({
    groupBy,
    timeRange,
  });

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-lg" />;
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No watch data yet
      </p>
    );
  }

  const smoothing = smoothingWindow > 0;
  const avgSmoothed = smoothing
    ? sma(
        data.map((d) => d.avgHoursPerDay),
        smoothingWindow,
      )
    : null;
  const pctSmoothed = smoothing
    ? smaNullable(
        data.map((d) => d.productivityPct),
        smoothingWindow,
      )
    : null;

  const chartData = data.map((d, i) => ({
    ...d,
    label: formatPeriod(d.period, groupBy),
    avgHoursPerDaySmoothed: avgSmoothed?.[i],
    productivityPctSmoothed: pctSmoothed?.[i],
  }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Smooth</span>
          <div className="flex gap-1">
            {SMOOTHING_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSmoothingWindow(s.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  smoothingWindow === s.value
                    ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {GROUP_OPTIONS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGroupBy(g.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                groupBy === g.value
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-72 w-full">
        <ComposedChart
          data={chartData}
          onMouseMove={(state) => {
            const next =
              state && typeof state.activeTooltipIndex === "number"
                ? state.activeTooltipIndex
                : null;
            if (next !== activeIndex) setActiveIndex(next);
          }}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="ytFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(0 72% 51%)" stopOpacity={0.3} />
              <stop
                offset="95%"
                stopColor="hsl(0 72% 51%)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}h`}
            width={40}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(217 91% 60%)" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            domain={[0, 100]}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  if (value == null) return null;
                  let label: string;
                  let formatted: string;
                  let color: string;
                  if (name === "avgHoursPerDay") {
                    label = "Watch Time";
                    formatted = `${(value as number).toFixed(2)} hrs/day`;
                    color = "hsl(0 72% 51%)";
                  } else if (name === "avgHoursPerDaySmoothed") {
                    label = `Watch Time (avg ${smoothingWindow})`;
                    formatted = `${(value as number).toFixed(2)} hrs/day`;
                    color = "hsl(0 72% 30%)";
                  } else if (name === "productivityPctSmoothed") {
                    label = `Quality (avg ${smoothingWindow})`;
                    formatted = `${(value as number).toFixed(1)}%`;
                    color = "hsl(217 91% 35%)";
                  } else {
                    label = "Quality";
                    formatted = `${(value as number).toFixed(1)}%`;
                    color = "hsl(217 91% 60%)";
                  }
                  return (
                    <>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: color }}
                      />
                      <div className="flex flex-1 justify-between gap-4 leading-none">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-foreground font-mono font-bold tabular-nums">
                          {formatted}
                        </span>
                      </div>
                    </>
                  );
                }}
              />
            }
          />
          {activeIndex !== null && chartData[activeIndex] && (
            <ReferenceLine
              yAxisId="left"
              y={chartData[activeIndex].avgHoursPerDay}
              stroke="hsl(0 72% 51%)"
              strokeDasharray="2 3"
              strokeOpacity={0.5}
              ifOverflow="extendDomain"
            />
          )}
          {activeIndex !== null &&
            chartData[activeIndex]?.productivityPct != null && (
              <ReferenceLine
                yAxisId="right"
                y={chartData[activeIndex].productivityPct}
                stroke="hsl(217 91% 60%)"
                strokeDasharray="2 3"
                strokeOpacity={0.5}
                ifOverflow="extendDomain"
              />
            )}
          {smoothing &&
            activeIndex !== null &&
            chartData[activeIndex]?.avgHoursPerDaySmoothed !== undefined && (
              <ReferenceLine
                yAxisId="left"
                y={chartData[activeIndex].avgHoursPerDaySmoothed}
                stroke="hsl(0 72% 30%)"
                strokeDasharray="2 3"
                strokeOpacity={0.6}
                ifOverflow="extendDomain"
              />
            )}
          {smoothing &&
            activeIndex !== null &&
            chartData[activeIndex]?.productivityPctSmoothed != null && (
              <ReferenceLine
                yAxisId="right"
                y={chartData[activeIndex].productivityPctSmoothed}
                stroke="hsl(217 91% 35%)"
                strokeDasharray="2 3"
                strokeOpacity={0.6}
                ifOverflow="extendDomain"
              />
            )}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="avgHoursPerDay"
            stroke="hsl(0 72% 51%)"
            strokeWidth={1.5}
            fill="url(#ytFill)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="productivityPct"
            stroke="hsl(217 91% 60%)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          {smoothing && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgHoursPerDaySmoothed"
              stroke="hsl(0 72% 30%)"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {smoothing && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="productivityPctSmoothed"
              stroke="hsl(217 91% 35%)"
              strokeWidth={3}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>

      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Watch Time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          Quality %
        </span>
      </div>
    </div>
  );
}
