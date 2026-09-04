"use client";

import {
  BarbellIcon,
  BookOpenIcon,
  BookOpenTextIcon,
  CalendarBlankIcon,
  ClockIcon,
  HashIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";

import type {
  BookStatsCardData,
  WorkoutStatsCardData,
} from "~/lib/site/pageCardData";

import { type PlacardSize, PlacardStatsCard } from "./PlacardStatsCard";

/**
 * The two stats cards, built once here so the homepage placards and the
 * hover cards on links to those pages show the same figures formatted the
 * same way.
 */

export function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K`;
  return lbs.toLocaleString();
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatStat(value: number | null, suffix = "") {
  return value === null ? "—" : `${value.toFixed(1)}${suffix}`;
}

export function BookStatsCard({
  data,
  size = "placard",
}: {
  data: BookStatsCardData;
  size?: PlacardSize;
}) {
  const { stats } = data;
  return (
    <PlacardStatsCard
      size={size}
      headline={stats.total.toLocaleString()}
      headlineIcon={BookOpenIcon}
      headlineLabel={`Books since ${stats.trackedSince ?? "the beginning"}`}
      years={data.yearly.map((year) => ({
        year: year.year,
        value: year.books,
        projectedRemainder: year.projectedRemainder,
      }))}
      yearUnit="books"
      compactMobile
      stats={[
        {
          icon: CalendarBlankIcon,
          label: "Per year",
          value: formatStat(stats.perYear),
        },
        {
          icon: ClockIcon,
          label: "Average read",
          value: formatStat(stats.avgDays, "d"),
        },
        {
          icon: BookOpenTextIcon,
          label: "Pages / day",
          value: formatStat(stats.pagesPerDay),
        },
      ]}
    />
  );
}

export function WorkoutStatsCard({
  data,
  size = "placard",
}: {
  data: WorkoutStatsCardData;
  size?: PlacardSize;
}) {
  const { stats } = data;
  const trackedSince = data.yearly[0]?.year;

  return (
    <PlacardStatsCard
      size={size}
      headline={stats.totalWorkouts.toLocaleString()}
      headlineIcon={HashIcon}
      headlineLabel={`Workouts${trackedSince ? ` since ${trackedSince}` : " logged"}`}
      years={data.yearly.map((year) => ({
        year: year.year,
        value: year.workouts,
        projectedRemainder: year.projectedRemainder,
      }))}
      yearUnit="workouts"
      compactMobile
      stats={[
        {
          icon: SquaresFourIcon,
          label: "Sets",
          value: formatCount(stats.totalSets),
        },
        {
          icon: ClockIcon,
          label: "Training Time",
          value: `${(stats.totalDurationSeconds / 86_400).toFixed(1)}d`,
        },
        {
          icon: BarbellIcon,
          label: "Lbs lifted",
          value: formatVolume(stats.totalVolume),
        },
      ]}
    />
  );
}
