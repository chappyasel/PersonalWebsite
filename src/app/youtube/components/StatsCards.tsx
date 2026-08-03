"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  ClockIcon,
  MonitorPlayIcon,
  SmileyIcon,
  StudentIcon,
} from "@phosphor-icons/react/dist/ssr";

import { scoreTextClass } from "~/lib/youtube/dashboard";
import { api } from "~/trpc/react";

import { Skeleton } from "~/components/ui/skeleton";

function scoreDetail(
  delta: number | null | undefined,
  coverage: number | null | undefined,
): string {
  const change =
    delta == null
      ? ""
      : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}`;
  const covered =
    coverage == null ? "" : `${Math.round(coverage * 100)}% coverage`;
  return [change, covered].filter(Boolean).join(" · ");
}

export function StatsCards() {
  const { data: stats, isLoading: statsLoading } =
    api.youtube.getStats.useQuery();
  const { data: diet, isLoading: dietLoading } =
    api.youtube.getInformationDietSummary.useQuery();
  if (statsLoading || dietLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!stats) return null;
  type Card = {
    label: string;
    value: string;
    sub?: string;
    icon: Icon;
    score?: number | null;
  };
  const exposureSeconds = stats.totalEstimatedExposureSeconds;
  const cards: Card[] = [
    {
      label: "Watch Events",
      value: stats.totalVideos.toLocaleString(),
      icon: MonitorPlayIcon,
    },
    {
      label: "Estimated Watch Time",
      value: `${Math.round(exposureSeconds / 3600).toLocaleString()} hrs`,
      sub: `${(exposureSeconds / 86400).toFixed(1)} days`,
      icon: ClockIcon,
    },
    {
      label: "Learning Value",
      value:
        diet?.current.learningValue == null
          ? "—"
          : diet.current.learningValue.toFixed(1),
      sub: scoreDetail(diet?.learningDelta, diet?.current.learningCoverage),
      icon: StudentIcon,
      score: diet?.current.learningValue ?? null,
    },
    {
      label: "Positivity",
      value:
        diet?.current.positivity == null
          ? "—"
          : diet.current.positivity.toFixed(1),
      sub: scoreDetail(diet?.positivityDelta, diet?.current.positivityCoverage),
      icon: SmileyIcon,
      score: diet?.current.positivity ?? null,
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
          <p
            className={
              "mt-1 font-rounded text-xl font-semibold " +
              (card.score === undefined
                ? "text-neutral-800 dark:text-neutral-100"
                : scoreTextClass(card.score))
            }
          >
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
