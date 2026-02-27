"use client";

import { BarbellIcon, ClockIcon, HashIcon, SquaresFourIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { Skeleton } from "~/components/ui/skeleton";
import { devSubdomainUrl } from "~/lib/util";
import { api } from "~/trpc/react";

import TiltCard from "./TiltCard";

const DEFAULT_EXERCISES = [
  "Flat Barbell Bench Press",
  "Incline Barbell Bench Press",
  "Close-grip Bench Press",
  "70 Degree Incline Press",
  "Barbell Overhead Press",
  "Back Squats",
  "Sumo Deadlifts",
  "Conventional Deadlifts",
  "Normal Lat Pulldowns",
  "Incline bench Bent Rows",
  "Barbell Conventional Curls",
  "Barbell Preacher Curls",
  "One-arm Overhead Extensions",
];

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K`;
  return lbs.toLocaleString();
}

function useAggregateChart() {
  const { data: progressionData, isLoading } =
    api.weightlifting.getStrengthProgression.useQuery({
      exercises: DEFAULT_EXERCISES,
    });

  const chartData = useMemo(() => {
    if (!progressionData || progressionData.length === 0) return [];

    const sorted = [...progressionData].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const currentBest: Record<string, number> = {};
    const allPoints: { date: string; total: number }[] = [];

    for (const row of sorted) {
      const prev = currentBest[row.exercise] ?? 0;
      if (row.bestOneRM > prev) {
        currentBest[row.exercise] = row.bestOneRM;
        const total = Object.values(currentBest).reduce((s, v) => s + v, 0);
        allPoints.push({ date: row.date, total: Math.round(total) });
      }
    }

    // Consolidate to monthly
    const monthMap = new Map<string, number>();
    for (const p of allPoints) {
      const month = p.date.slice(0, 7);
      monthMap.set(month, p.total);
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, total]) => ({ total }));
  }, [progressionData]);

  return { chartData, isLoading };
}

export default function Weightlifting() {
  const { data: stats, isLoading: statsLoading } = api.weightlifting.getStats.useQuery();
  const { chartData, isLoading: chartLoading } = useAggregateChart();

  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] md:gap-3 md:text-3xl dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)]">
        <BarbellIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Weightlifting
      </h1>
      <TiltCard
        className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        hoverScale={1.05}
      >
        <Link
          className="block w-full overflow-hidden rounded-xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_12px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-300 ease-in-out hover:shadow-[0px_4px_15px_0px_rgba(0,0,0,0.1)]"
          href={
            process.env.NODE_ENV === "production"
              ? "https://weightlifting.chappyasel.com"
              : devSubdomainUrl("weightlifting")
          }
        >
          {/* Aggregate chart */}
          <div className="px-6 pt-6">
            {chartLoading || chartData.length === 0 ? (
              <Skeleton className="h-[240px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="wlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--foreground))"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(var(--foreground))"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--foreground) / 0.3)"
                    strokeWidth={2}
                    fill="url(#wlGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-col items-center px-8 pb-5 pt-3">
            <div className="mb-3 h-px w-2/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="flex w-full justify-around gap-1">
              <div className="flex flex-col items-center gap-0.5">
                {!stats ? (
                  <Skeleton className="h-8 w-14 rounded sm:h-9" />
                ) : (
                  <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                    {stats.totalWorkouts.toLocaleString()}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <HashIcon className="size-3.5 sm:size-4" weight="bold" />
                  Workouts
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                {!stats ? (
                  <Skeleton className="h-8 w-16 rounded sm:h-9" />
                ) : (
                  <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                    {stats.totalSets.toLocaleString()}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <SquaresFourIcon className="size-3.5 sm:size-4" weight="bold" />
                  Sets
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                {!stats ? (
                  <Skeleton className="h-8 w-16 rounded sm:h-9" />
                ) : (
                  <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                    {`${(stats.totalDurationSeconds / 86400).toFixed(1)}d`}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <ClockIcon className="size-3.5 sm:size-4" weight="bold" />
                  Duration
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                {!stats ? (
                  <Skeleton className="h-8 w-20 rounded sm:h-9" />
                ) : (
                  <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                    {`${formatVolume(stats.totalVolume)} lbs`}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <BarbellIcon className="size-3.5 sm:size-4" weight="bold" />
                  Volume
                </span>
              </div>
            </div>
          </div>
        </Link>
      </TiltCard>
    </section>
  );
}
