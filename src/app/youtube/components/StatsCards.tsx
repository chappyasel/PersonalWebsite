"use client";

import {
  ClockIcon,
  HashIcon,
  MonitorPlayIcon,
  UsersIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export function StatsCards() {
  const { data: stats, isLoading } = api.youtube.getStats.useQuery();

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

  const cards: { label: string; value: string; sub?: string; icon: Icon }[] = [
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
      label: "Channels",
      value: stats.uniqueChannels.toLocaleString(),
      icon: UsersIcon,
    },
    {
      label: "Since",
      value: stats.earliestWatch
        ? new Date(stats.earliestWatch).getFullYear().toString()
        : "—",
      icon: HashIcon,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <p className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <card.icon className="h-4 w-4" weight="bold" />
            {card.label}
          </p>
          <p className="mt-1 font-rounded text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            {card.value}
          </p>
          {card.sub && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {card.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
