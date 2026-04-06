"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

const chartConfig = {
  avgHoursPerDay: {
    label: "Hrs/day",
    color: "hsl(0 72% 51%)", // red-600
  },
} satisfies ChartConfig;

type GroupBy = "week" | "month" | "quarter";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
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
    timeZone: "UTC",
  });
}

export function WatchTimeChart() {
  const [groupBy, setGroupBy] = useState<GroupBy>("month");

  const { data, isLoading } = api.youtube.getWatchTimeOverTime.useQuery({
    groupBy,
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
      <div className="mb-3 flex justify-end gap-1">
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

      <ChartContainer config={chartConfig} className="h-72 w-full">
        <AreaChart data={chartData}>
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
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}h`}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => [
                  `${(value as number).toFixed(2)} hrs/day`,
                  "Avg Watch Time",
                ]}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="avgHoursPerDay"
            stroke="hsl(0 72% 51%)"
            strokeWidth={1.5}
            fill="url(#ytFill)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
