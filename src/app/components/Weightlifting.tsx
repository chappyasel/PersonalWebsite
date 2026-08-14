"use client";

import { categoryColor } from "../weightlifting/lib/utils";
import {
  BarbellIcon,
  ClockIcon,
  HashIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo } from "react";

import { devSubdomainUrl } from "~/lib/util";
import type {
  ActivityMosaicData,
  WeightliftingStatsData,
} from "~/server/queries/weightlifting";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import TiltCard from "./TiltCard";

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K`;
  return lbs.toLocaleString();
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
    <div className="px-5 pb-5 sm:px-6 sm:pb-6">
      <div className="h-[300px] rounded-lg border border-foreground/[0.06] bg-background/20 p-3 sm:h-[340px]">
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
                            cell.volume > 0
                              ? 0.25 + cell.intensity * 0.75
                              : 0.08,
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
    </div>
  );
}

export default function Weightlifting({
  activity,
  stats,
}: {
  activity: ActivityMosaicData;
  stats: WeightliftingStatsData;
}) {
  return (
    <section
      data-homepage-lifting
      className="flex w-full flex-col items-center justify-around gap-4"
    >
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
        <BarbellIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Weightlifting
      </h1>
      <TiltCard
        className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        hoverScale={1.02}
      >
        <Link
          data-placard-surface=""
          className="block w-full overflow-hidden rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_12px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
          href={
            process.env.NODE_ENV === "production"
              ? "https://weightlifting.chappyasel.com"
              : devSubdomainUrl("weightlifting")
          }
        >
          <div className="flex flex-col items-center p-5 sm:p-6 sm:pb-4">
            <div className="flex w-full justify-around gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                  {stats.totalWorkouts.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <HashIcon className="size-3.5 sm:size-4" weight="bold" />
                  Workouts
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                  {stats.totalSets.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <SquaresFourIcon
                    className="size-3.5 sm:size-4"
                    weight="bold"
                  />
                  Sets
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                  {`${(stats.totalDurationSeconds / 86400).toFixed(1)}d`}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <ClockIcon className="size-3.5 sm:size-4" weight="bold" />
                  Duration
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-semibold text-foreground sm:text-3xl">
                  {`${formatVolume(stats.totalVolume)} lbs`}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <BarbellIcon className="size-3.5 sm:size-4" weight="bold" />
                  Volume
                </span>
              </div>
            </div>
          </div>
          <ActivityMosaic data={activity} />
        </Link>
      </TiltCard>
    </section>
  );
}
