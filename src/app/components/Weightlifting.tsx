"use client";

import { categoryColor } from "../weightlifting/lib/utils";
import {
  BarbellIcon,
  CalendarDotsIcon,
  ClockIcon,
  HashIcon,
  SquaresFourIcon,
  TrophyIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { IntersectionMotion } from "~/components/ui/intersection-motion";
import { devSubdomainUrl } from "~/lib/util";
import type {
  ActivityMosaicData,
  WeightliftingPlacardData,
} from "~/server/queries/weightlifting";

import {
  MOSAIC_DAYS,
  type MosaicCell,
  PlacardMosaic,
  mosaicDateLabel,
} from "./stacks/dom/PlacardMosaic";
import {
  PlacardCardHeading,
  PlacardLinkCard,
  PlacardStatsCard,
} from "./stacks/dom/PlacardStatsCard";

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K`;
  return lbs.toLocaleString();
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function parseLocalDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`);
}

function dateToKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function categoryLabel(categories: Record<string, number>) {
  const entries = Object.entries(categories);
  if (entries.length === 0) return "Workout";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category} ${count}`)
    .join(" / ");
}

function categoryBackground(categories: Record<string, number>) {
  const entries = Object.entries(categories).filter(([, count]) => count > 0);
  if (entries.length === 0) return "hsl(var(--foreground))";

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let cursor = 0;
  const stops = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => {
      const start = cursor;
      cursor += (count / total) * 100;
      const color = categoryColor(category);
      return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function useActivityCells(data: ActivityMosaicData): MosaicCell[] {
  return useMemo(() => {
    if (!data.endDate) return [];

    const dayMap = new Map(data.days.map((day) => [day.date, day]));
    const startDate = addDays(parseLocalDate(data.endDate), -(MOSAIC_DAYS - 1));

    return Array.from({ length: MOSAIC_DAYS }).map((_, index) => {
      const key = dateToKey(addDays(startDate, index));
      const day = dayMap.get(key);
      const intensity =
        day && data.maxVolume
          ? Math.max(0.24, Math.min(1, day.volume / data.maxVolume))
          : 0;
      const volume = day?.volume ?? 0;
      return {
        key,
        background: categoryBackground(day?.categories ?? {}),
        opacity: volume > 0 ? 0.25 + intensity * 0.75 : 0.08,
        active: volume > 0,
        tooltipHeading: mosaicDateLabel(key),
        tooltipDetail: day
          ? `${formatVolume(day.volume)} lbs · ${categoryLabel(day.categories)}`
          : "Rest",
      };
    });
  }, [data]);
}

function ActivityMosaic({ data }: { data: ActivityMosaicData }) {
  const cells = useActivityCells(data);
  return (
    <PlacardMosaic
      cells={cells}
      label={`${data.activeDays} training days in the last 12 months`}
    />
  );
}

function WorkoutStatsCard({ data }: { data: WeightliftingPlacardData }) {
  const { stats } = data;
  const trackedSince = data.yearly[0]?.year;

  return (
    <PlacardStatsCard
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

function FeaturedRecords({ data }: { data: WeightliftingPlacardData }) {
  return (
    <div>
      <PlacardCardHeading
        icon={TrophyIcon}
        detail="Estimated 1RM"
        className="mb-1"
      >
        Big three
      </PlacardCardHeading>
      <div className="divide-y divide-foreground/10">
        {data.records.map((record) => (
          <div
            key={record.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: record.category
                    ? categoryColor(record.category)
                    : "hsl(var(--foreground))",
                }}
              />
              <div className="min-w-0">
                <strong className="block font-serif text-lg font-medium leading-tight text-foreground">
                  {record.label}
                </strong>
                <span className="block truncate text-xs text-muted-foreground">
                  {record.exerciseName}
                </span>
              </div>
            </div>
            <div className="text-right tabular-nums">
              <strong className="block text-lg font-semibold leading-tight text-foreground">
                {record.bestOneRM === null
                  ? "—"
                  : `${Math.round(record.bestOneRM)} lbs`}
              </strong>
              {record.reps !== null && record.weight !== null ? (
                <span className="block text-xs text-muted-foreground">
                  {record.reps} × {record.weight}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Weightlifting({
  activity,
  data,
}: {
  activity: ActivityMosaicData;
  data: WeightliftingPlacardData;
}) {
  const href =
    process.env.NODE_ENV === "production"
      ? "https://weightlifting.chappyasel.com"
      : devSubdomainUrl("weightlifting");

  return (
    <section
      data-homepage-lifting
      className="flex w-full flex-col items-center justify-around gap-4"
    >
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <BarbellIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Weightlifting
      </h1>
      <IntersectionMotion className="flex w-full flex-col gap-4 intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
        <PlacardLinkCard
          href={href}
          label="Browse weightlifting statistics"
          mobileCompact
        >
          <WorkoutStatsCard data={data} />
        </PlacardLinkCard>
        <PlacardLinkCard href={href} label="Browse featured lift records">
          <FeaturedRecords data={data} />
        </PlacardLinkCard>
        <PlacardLinkCard href={href} label="Browse the full workout history">
          <PlacardCardHeading icon={CalendarDotsIcon} detail="Last 12 months">
            Workout history
          </PlacardCardHeading>
          <ActivityMosaic data={activity} />
        </PlacardLinkCard>
      </IntersectionMotion>
    </section>
  );
}
