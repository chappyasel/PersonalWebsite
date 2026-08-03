"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  scoreTextClass,
  smoothInformationDietTrend,
} from "~/lib/youtube/dashboard";
import { api } from "~/trpc/react";

import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";

import { type TimeRange, TimeRangeToggle } from "./TimeRangeToggle";

type GroupBy = "day" | "week" | "month" | "quarter";
const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
];

const SMOOTHING_OPTIONS = [
  { value: 0, label: "None" },
  { value: 3, label: "3" },
  { value: 7, label: "7" },
  { value: 14, label: "14" },
  { value: 30, label: "30" },
] as const;

function formatPeriod(value: string, groupBy: GroupBy): string {
  const date = new Date(value + "T00:00:00Z");
  if (groupBy === "quarter") {
    return (
      "Q" +
      (Math.floor(date.getUTCMonth() / 3) + 1) +
      " " +
      date.getUTCFullYear()
    );
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: groupBy === "month" ? undefined : "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

type ChartRow = ReturnType<typeof smoothInformationDietTrend>[number] & {
  period: string;
  label: string;
  estimatedExposureHours: number;
  videoCount: number;
  learningValue: number | null;
  learningCoverage: number | null;
  positivity: number | null;
  positivityCoverage: number | null;
};

function ScoreValue({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="flex justify-between gap-5">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={"font-medium tabular-nums " + scoreTextClass(value)}>
        {value === null ? "—" : value.toFixed(1)}
      </span>
    </span>
  );
}

function TrendTooltip({
  active,
  payload,
  smoothingWindow,
  visible,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  smoothingWindow: number;
  visible: boolean;
}) {
  const row = payload?.[0]?.payload;
  if (!visible || !active || !row) return null;
  const trendLabel =
    smoothingWindow === 0 ? "Raw" : smoothingWindow + "-period";
  return (
    <div className="min-w-56 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <p className="mb-1.5 font-medium">{row.label}</p>
      <p className="flex justify-between gap-5">
        <span className="text-neutral-500 dark:text-neutral-400">
          Watch time
        </span>
        <span className="font-medium tabular-nums">
          {row.estimatedExposureHours.toFixed(1)}h
        </span>
      </p>
      <p className="mb-1.5 flex justify-between gap-5">
        <span className="text-neutral-500 dark:text-neutral-400">
          {trendLabel} trend
        </span>
        <span className="font-medium tabular-nums text-red-700 dark:text-red-300">
          {row.estimatedExposureHoursSmoothed.toFixed(1)}h
        </span>
      </p>
      <ScoreValue label="Learning" value={row.learningValue} />
      <ScoreValue label="Learning trend" value={row.learningValueSmoothed} />
      <p className="mb-1 text-right text-[10px] tabular-nums text-neutral-400">
        {row.learningCoverageSmoothed === null
          ? "—"
          : Math.round(row.learningCoverageSmoothed * 100) + "%"}{" "}
        rolling coverage
      </p>
      <ScoreValue label="Positivity" value={row.positivity} />
      <ScoreValue label="Positivity trend" value={row.positivitySmoothed} />
      <p className="text-right text-[10px] tabular-nums text-neutral-400">
        {row.positivityCoverageSmoothed === null
          ? "—"
          : Math.round(row.positivityCoverageSmoothed * 100) + "%"}{" "}
        rolling coverage
      </p>
    </div>
  );
}

export function WatchTimeChart() {
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>("1y");
  const [smoothingWindow, setSmoothingWindow] = useState(7);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<
    "watch-time" | "scores" | null
  >(null);
  const { data, isLoading } = api.youtube.getInformationDietTrend.useQuery({
    groupBy,
    timeRange,
  });

  if (isLoading) return <Skeleton className="h-[30rem] w-full rounded-lg" />;
  if (!data?.length) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No watch data yet
      </p>
    );
  }

  const smoothed = smoothInformationDietTrend(data, smoothingWindow);
  const chartData: ChartRow[] = data.map((row, index) => ({
    ...row,
    ...smoothed[index]!,
    label: formatPeriod(row.period, groupBy),
  }));
  const activeRow = activeIndex === null ? null : chartData[activeIndex];
  const setIndexFromChart = (
    state: {
      activeTooltipIndex?: number | string;
    } | null,
    panel: "watch-time" | "scores",
  ) => {
    const next = state?.activeTooltipIndex;
    setActiveIndex(typeof next === "number" ? next : null);
    setActivePanel(typeof next === "number" ? panel : null);
  };
  const clearActive = () => {
    setActiveIndex(null);
    setActivePanel(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Smooth</span>
          <div className="flex gap-1">
            {SMOOTHING_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSmoothingWindow(option.value)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                  (smoothingWindow === option.value
                    ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setGroupBy(option.value)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                (groupBy === option.value
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-1 text-xs font-medium text-neutral-500">
        Estimated Watch Time
      </p>
      <ChartContainer
        config={{
          estimatedExposureHours: {
            label: "Estimated hours",
            color: "hsl(0 72% 51%)",
          },
        }}
        className="h-64 w-full"
      >
        <ComposedChart
          data={chartData}
          syncId="youtube-information-diet"
          syncMethod="index"
          onMouseMove={(state) => setIndexFromChart(state, "watch-time")}
          onMouseLeave={clearActive}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="currentColor"
            strokeOpacity={0.22}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={38}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => value.toFixed(0) + "h"}
          />
          <ChartTooltip
            content={
              <TrendTooltip
                smoothingWindow={smoothingWindow}
                visible={activePanel === "watch-time"}
              />
            }
          />
          {activeRow && (
            <ReferenceLine
              x={activeRow.label}
              stroke="currentColor"
              strokeDasharray="3 3"
              strokeOpacity={0.45}
            />
          )}
          <Bar
            dataKey="estimatedExposureHours"
            fill="hsl(0 72% 51%)"
            fillOpacity={0.34}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="estimatedExposureHoursSmoothed"
            stroke="hsl(0 72% 38%)"
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>

      <p className="mb-1 mt-4 text-xs font-medium text-neutral-500">
        Learning Value + Positivity
      </p>
      <ChartContainer
        config={{
          learningValue: { label: "Learning Value", color: "hsl(217 91% 55%)" },
          positivity: { label: "Positivity", color: "hsl(142 65% 40%)" },
        }}
        className="h-48 w-full"
      >
        <LineChart
          data={chartData}
          syncId="youtube-information-diet"
          syncMethod="index"
          onMouseMove={(state) => setIndexFromChart(state, "scores")}
          onMouseLeave={clearActive}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="currentColor"
            strokeOpacity={0.22}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tickLine={false}
            axisLine={false}
            width={24}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            content={
              <TrendTooltip
                smoothingWindow={smoothingWindow}
                visible={activePanel === "scores"}
              />
            }
          />
          {activeRow && (
            <ReferenceLine
              x={activeRow.label}
              stroke="currentColor"
              strokeDasharray="3 3"
              strokeOpacity={0.45}
            />
          )}
          {activeRow?.learningValueSmoothed !== null &&
            activeRow?.learningValueSmoothed !== undefined && (
              <ReferenceLine
                y={activeRow.learningValueSmoothed}
                stroke="hsl(217 91% 55%)"
                strokeDasharray="3 3"
                strokeOpacity={0.55}
              />
            )}
          {activeRow?.positivitySmoothed !== null &&
            activeRow?.positivitySmoothed !== undefined && (
              <ReferenceLine
                y={activeRow.positivitySmoothed}
                stroke="hsl(142 65% 40%)"
                strokeDasharray="3 3"
                strokeOpacity={0.55}
              />
            )}
          <Line
            type="monotone"
            dataKey="learningValue"
            stroke="hsl(217 91% 55%)"
            strokeOpacity={0.25}
            strokeWidth={1.25}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="positivity"
            stroke="hsl(142 65% 40%)"
            strokeOpacity={0.25}
            strokeWidth={1.25}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="learningValueSmoothed"
            stroke="hsl(217 91% 55%)"
            strokeWidth={3}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="positivitySmoothed"
            stroke="hsl(142 65% 40%)"
            strokeWidth={3}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="mt-2 flex justify-center gap-5 text-xs text-neutral-500">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
          Learning Value
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600" />
          Positivity
        </span>
      </div>
    </div>
  );
}
