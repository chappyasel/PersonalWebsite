"use client";

import {
  ChartLineUpIcon,
  ClockIcon,
  GaugeIcon,
  MonitorPlayIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export function StatsCards() {
  const { data: stats, isLoading: statsLoading } =
    api.youtube.getStats.useQuery();
  const { data: quality, isLoading: qualityLoading } =
    api.youtube.getQualityScore.useQuery();

  const isLoading = statsLoading || qualityLoading;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const totalHours = Math.round(stats.totalDurationSeconds / 3600);
  const totalDays = (stats.totalDurationSeconds / 86400).toFixed(1);

  type CardDef = {
    label: string;
    value: string;
    sub?: string;
    subColor?: string;
    icon: Icon;
    className?: string;
  };

  const cards: CardDef[] = [
    {
      label: "Videos Watched",
      value: stats.totalVideos.toLocaleString(),
      icon: MonitorPlayIcon,
    },
    {
      label: "Watch Time",
      value: `${totalHours.toLocaleString()} hrs`,
      sub: `${totalDays} days`,
      icon: ClockIcon,
    },
    {
      label: "Avg Daily",
      value:
        stats.earliestWatch && stats.latestWatch
          ? (() => {
              const days = Math.max(
                1,
                Math.round(
                  (new Date(stats.latestWatch).getTime() -
                    new Date(stats.earliestWatch).getTime()) /
                    86400000,
                ),
              );
              const avgHrs = stats.totalDurationSeconds / 3600 / days;
              return `${avgHrs.toFixed(1)} hrs`;
            })()
          : "—",
      sub: stats.earliestWatch
        ? `since ${new Date(stats.earliestWatch).getFullYear()}`
        : undefined,
      icon: ChartLineUpIcon,
    },
    {
      label: "Quality Score",
      value: quality ? `${quality.currentPct.toFixed(0)}%` : "—",
      sub: quality
        ? quality.deltaPct >= 0
          ? `↑ ${quality.deltaPct.toFixed(1)}%`
          : `↓ ${Math.abs(quality.deltaPct).toFixed(1)}%`
        : undefined,
      subColor: quality
        ? quality.deltaPct >= 0
          ? "text-green-500"
          : "text-red-500"
        : undefined,
      icon: GaugeIcon,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800 ${card.className ?? ""}`}
        >
          <p className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <card.icon className="h-4 w-4" weight="bold" />
            {card.label}
          </p>
          <p className="mt-1 font-rounded text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            {card.value}
          </p>
          {card.sub && (
            <p
              className={`text-xs ${card.subColor ?? "text-neutral-400 dark:text-neutral-500"}`}
            >
              {card.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
