"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Skeleton } from "~/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "~/components/ui/chart";
import { api } from "~/trpc/react";
import { TimeRangeToggle, type TimeRange } from "./TimeRangeToggle";

const SUB_TIERS = [
  { key: "deepLearning", label: "Deep Learning", color: "hsl(152 82% 28%)" },
  { key: "education", label: "Education", color: "hsl(142 76% 40%)" },
  { key: "growth", label: "Growth", color: "hsl(160 55% 52%)" },
  { key: "informational", label: "Informational", color: "hsl(45 93% 52%)" },
  { key: "lowValue", label: "Low Value", color: "hsl(25 95% 55%)" },
  { key: "brainRot", label: "Brain Rot", color: "hsl(0 72% 51%)" },
] as const;

const chartConfig = Object.fromEntries(
  SUB_TIERS.map((t) => [t.key, { label: t.label, color: t.color }]),
) satisfies ChartConfig;

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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((s, p) => s + p.value, 0);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <p className="mb-1.5 font-medium text-neutral-700 dark:text-neutral-200">
        {label}
      </p>
      {payload
        .filter((p) => p.value > 0.001)
        .map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.fill }}
              />
              {chartConfig[p.name as keyof typeof chartConfig]?.label ?? p.name}
            </span>
            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
              {p.value.toFixed(2)} h/d
              {total > 0 && (
                <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                  ({((p.value / total) * 100).toFixed(0)}%)
                </span>
              )}
            </span>
          </div>
        ))}
      <div className="mt-1 border-t border-neutral-100 pt-1 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Total: {total.toFixed(2)} h/d
      </div>
    </div>
  );
}

export function CategoryBreakdown() {
  const [groupBy, setGroupBy] = useState<GroupBy>("quarter");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const { data, isLoading } = api.youtube.getCategoryBreakdown.useQuery({
    groupBy,
    timeRange,
  });

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-lg" />;
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No category data yet
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
        <BarChart data={chartData}>
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
          <ChartTooltip content={<CustomTooltip />} />
          {SUB_TIERS.map((t, i) => (
            <Bar
              key={t.key}
              dataKey={t.key}
              stackId="a"
              fill={t.color}
              radius={
                i === SUB_TIERS.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]
              }
            />
          ))}
        </BarChart>
      </ChartContainer>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        {SUB_TIERS.map((t) => (
          <span key={t.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
