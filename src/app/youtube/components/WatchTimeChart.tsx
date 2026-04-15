"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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

function formatPeriod(dateStr: string, groupBy: GroupBy) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (groupBy === "quarter") {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.toLocaleDateString("en-US", { year: "2-digit", timeZone: "UTC" })}`;
  }
  if (groupBy === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function WatchTimeChart() {
  const [groupBy, setGroupBy] = useState<GroupBy>("month");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

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

  const chartData = data.map((d) => ({
    ...d,
    label: formatPeriod(d.period, groupBy),
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
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
        <ComposedChart data={chartData}>
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
                  if (name === "avgHoursPerDay")
                    return [
                      `${(value as number).toFixed(2)} hrs/day`,
                      "Watch Time",
                    ];
                  return [
                    `${(value as number).toFixed(1)}%`,
                    "Quality",
                  ];
                }}
              />
            }
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="avgHoursPerDay"
            stroke="hsl(0 72% 51%)"
            strokeWidth={1.5}
            fill="url(#ytFill)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="productivityPct"
            stroke="hsl(217 91% 60%)"
            strokeWidth={1.5}
            dot={false}
          />
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
