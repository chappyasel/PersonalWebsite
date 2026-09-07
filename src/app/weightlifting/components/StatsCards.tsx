"use client";

import {
  daysInGymLine,
  eiffelTowersLine,
  setsPerWorkoutLine,
  workoutsPerWeekLine,
} from "../lib/statTranslations";
import { QUERY_STALE_TIME, formatVolume } from "../lib/utils";
import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  ClockIcon,
  HashIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react/dist/ssr";

import { api } from "~/trpc/react";

import { Skeleton } from "~/components/ui/skeleton";

import { QueryErrorFallback } from "./QueryErrorFallback";

export function StatsCards() {
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getStats.useQuery(undefined, {
    staleTime: QUERY_STALE_TIME,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <QueryErrorFallback label="stats" onRetry={() => void refetch()} />;
  }

  if (!stats) return null;

  const totalHours = Math.round(stats.totalDurationSeconds / 3600);

  const cards: {
    label: string;
    value: string;
    sub: string | null;
    icon: Icon;
  }[] = [
    {
      label: "Workouts",
      value: stats.totalWorkouts.toLocaleString(),
      sub: workoutsPerWeekLine(stats.totalWorkouts, stats.earliestWorkout),
      icon: HashIcon,
    },
    {
      label: "Total Sets",
      value: stats.totalSets.toLocaleString(),
      sub: setsPerWorkoutLine(stats.totalSets, stats.totalWorkouts),
      icon: SquaresFourIcon,
    },
    {
      label: "Total Volume",
      value: formatVolume(stats.totalVolume),
      sub: eiffelTowersLine(stats.totalVolume),
      icon: BarbellIcon,
    },
    {
      label: "Total Duration",
      value: `${totalHours.toLocaleString()} hrs`,
      sub: daysInGymLine(stats.totalDurationSeconds),
      icon: ClockIcon,
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
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              {card.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
