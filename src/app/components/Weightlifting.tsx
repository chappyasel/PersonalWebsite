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

import { devSubdomainUrl } from "~/lib/util";
import type {
  ActivityMosaicData,
  WeightliftingPlacardData,
} from "~/server/queries/weightlifting";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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

function formatShortDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

function useActivityCells(data: ActivityMosaicData) {
  const cells = useMemo(() => {
    if (!data.endDate) return [];

    const dayMap = new Map(data.days.map((day) => [day.date, day]));
    const startDate = addDays(parseLocalDate(data.endDate), -363);

    const items = Array.from({ length: MOSAIC_DAYS }).map((_, index) => {
      const date = addDays(startDate, index);
      const key = dateToKey(date);
      const day = dayMap.get(key);
      const intensity =
        day && data.maxVolume
          ? Math.max(0.24, Math.min(1, day.volume / data.maxVolume))
          : 0;

      const week = Math.floor(index / 7);
      const dayOfWeek = index % 7;

      return {
        key,
        categories: day?.categories ?? {},
        volume: day?.volume ?? 0,
        intensity,
        tooltipHeading: formatShortDate(key),
        tooltipDetail: day
          ? `${formatVolume(day.volume)} lbs · ${categoryLabel(day.categories)}`
          : "Rest",
        blockIndex: Math.floor(week / MOSAIC_COLUMNS),
        gridColumn: (week % MOSAIC_COLUMNS) + 1,
        gridRow: dayOfWeek + 1,
      };
    });

    // Derived from MOSAIC_BLOCKS rather than listed, so changing the block
    // count is one constant and not three places that can disagree.
    return Array.from({ length: MOSAIC_BLOCKS }, (_, block) =>
      items.filter((cell) => cell.blockIndex === block),
    );
  }, [data]);

  const displayStartDate = cells[0]?.[0]?.key ?? data?.startDate ?? null;
  const displayEndDate =
    cells[cells.length - 1]?.[MOSAIC_BLOCK_DAYS - 1]?.key ??
    data?.endDate ??
    null;

  return { cells, displayStartDate, displayEndDate };
}

// Four bands of a quarter-year rather than two of a half-year: same 364 days,
// same one-cell-per-day honesty, but each cell gets twice the width. At 26
// columns the year was legible as a texture and unreadable as data — the owner
// called it "too compact".
const MOSAIC_COLUMNS = 13;
const MOSAIC_ROWS = 7;
const MOSAIC_BLOCKS = 4;
const MOSAIC_DAYS = MOSAIC_COLUMNS * MOSAIC_ROWS * MOSAIC_BLOCKS;
/** Days in one band. The end-date label reads the last cell of the last one. */
const MOSAIC_BLOCK_DAYS = MOSAIC_COLUMNS * MOSAIC_ROWS;

function ActivityMosaic({ data }: { data: ActivityMosaicData }) {
  const { cells } = useActivityCells(data);

  return (
    <div
      className="h-[300px] sm:h-[340px]"
      role="img"
      aria-label={`${data.activeDays} training days in the last 12 months`}
    >
      <TooltipProvider delayDuration={150}>
        <div
          className="grid h-full gap-3"
          style={{
            gridTemplateRows: `repeat(${MOSAIC_BLOCKS}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((block, blockIndex) => (
            <div
              key={blockIndex}
              className="grid h-full gap-1"
              style={{
                gridTemplateColumns: `repeat(${MOSAIC_COLUMNS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${MOSAIC_ROWS}, minmax(0, 1fr))`,
              }}
            >
              {block.map((cell) => (
                <Tooltip key={cell.key}>
                  <TooltipTrigger asChild>
                    <div
                      className={`size-full rounded-[3px] ${
                        cell.volume > 0
                          ? "transition-transform duration-200 hover:scale-125"
                          : ""
                      }`}
                      style={{
                        background: categoryBackground(cell.categories),
                        opacity:
                          cell.volume > 0 ? 0.25 + cell.intensity * 0.75 : 0.08,
                        gridColumn: cell.gridColumn,
                        gridRow: cell.gridRow,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="max-w-56"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold leading-none">
                        {cell.tooltipHeading}
                      </p>
                      <p className="text-muted-foreground">
                        {cell.tooltipDetail}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
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
      <div className="flex w-full flex-col gap-4 intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
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
      </div>
    </section>
  );
}
