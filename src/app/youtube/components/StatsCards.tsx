"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  ClockIcon,
  SmileyIcon,
  StudentIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import {
  barSparkline,
  describePercentile,
  lineSparkline,
  scoreTextClass,
} from "~/lib/youtube/dashboard";
import { api } from "~/trpc/react";

import { Skeleton } from "~/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/** Below this, the score on a tile rests on too little scored watch time to
 *  stand on its own, so the tile says so instead of quietly implying a full
 *  reading. Above it the note would just be noise on every render. */
const COVERAGE_NOTE_THRESHOLD = 0.8;

function DeltaLine({
  current,
  prior,
  unit = "",
}: {
  current: number | null;
  prior: number | null;
  unit?: string;
}) {
  if (current === null || prior === null) return null;
  const arrow = current === prior ? "" : current > prior ? "↑ " : "↓ ";
  return (
    <>
      {arrow}from {prior.toFixed(1)}
      {unit} prior 30 days
    </>
  );
}

const SPARK_HEIGHT = 20;
const SPARK_WIDTH = 100;
/** Keeps the reference label off the top and bottom edges, where half of it
 *  would sit outside the plot. */
const LABEL_INSET_PERCENT = 7;

/**
 * A sparkline plus the dashed line it is read against. The comparison line is
 * the reason these tiles exist, so it is drawn over the marks, in ink dark
 * enough to find, and labelled with its own value: an unlabelled dashed line
 * is a riddle, and one at sub-pixel width is invisible.
 *
 * The label is HTML rather than SVG `<text>` because the plot is stretched
 * horizontally to fill the tile, which would smear any text inside it.
 */
function SparkFrame({
  label,
  referenceY,
  referenceLabel,
  children,
}: {
  label: string;
  referenceY: number | null;
  referenceLabel: string | null;
  children: React.ReactNode;
}) {
  const labelTop =
    referenceY === null
      ? 0
      : Math.min(
          100 - LABEL_INSET_PERCENT,
          Math.max(LABEL_INSET_PERCENT, (referenceY / SPARK_HEIGHT) * 100),
        );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative mt-2 cursor-default pr-7">
            <svg
              viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
              preserveAspectRatio="none"
              className="h-10 w-full overflow-visible"
              role="img"
              aria-label={label}
            >
              {children}
              {referenceY !== null && (
                <line
                  x1={0}
                  x2={SPARK_WIDTH}
                  y1={referenceY}
                  y2={referenceY}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-neutral-400 dark:stroke-neutral-400"
                />
              )}
            </svg>
            {referenceY !== null && referenceLabel && (
              <span
                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums leading-none text-neutral-400 dark:text-neutral-400"
                style={{ top: `${labelTop}%` }}
              >
                {referenceLabel}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-sans">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Daily watch hours. Zero days draw a baseline tick rather than nothing,
 *  because a day of not watching is a real reading here, not a gap. */
function HoursSparkline({
  daily,
  reference,
}: {
  daily: { date: string; hours: number }[];
  reference: number | null;
}) {
  if (daily.length === 0) return null;
  const { bars, referenceY } = barSparkline(daily, {
    reference,
    viewBoxHeight: SPARK_HEIGHT,
  });
  const step = SPARK_WIDTH / daily.length;

  return (
    <SparkFrame
      referenceY={referenceY}
      referenceLabel={reference == null ? null : `${reference.toFixed(1)}h`}
      label={`Daily watch hours over ${daily.length} days${
        reference == null
          ? ""
          : `. Dashed line: ${reference.toFixed(1)} hrs, the prior 30 days' daily average`
      }`}
    >
      {bars.map((bar, index) => (
        <rect
          key={bar.date}
          x={index * step}
          y={SPARK_HEIGHT - bar.height}
          width={step * 0.66}
          height={bar.height}
          className={
            bar.watched
              ? "fill-red-500/70"
              : "fill-neutral-300 dark:fill-neutral-600"
          }
        />
      ))}
    </SparkFrame>
  );
}

/** Trailing seven-day score. Smoothed because a daily score is undefined on
 *  every day with no watching, and a line full of holes reads as broken. */
function ScoreSparkline({
  points,
  reference,
  className,
  dimension,
}: {
  points: (number | null)[];
  reference: number | null;
  className: string;
  dimension: string;
}) {
  const { segments, referenceY } = lineSparkline(points, {
    reference,
    viewBoxHeight: SPARK_HEIGHT,
    viewBoxWidth: SPARK_WIDTH,
  });
  if (segments.length === 0) return null;

  return (
    <SparkFrame
      referenceY={referenceY}
      referenceLabel={reference == null ? null : reference.toFixed(1)}
      label={`Trailing 7-day ${dimension} over ${points.length} days${
        reference == null
          ? ""
          : `. Dashed line: ${reference.toFixed(1)}, the prior 30 days`
      }`}
    >
      {segments.map((segment) => (
        <path
          key={segment}
          d={segment}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={className}
        />
      ))}
    </SparkFrame>
  );
}

export function StatsCards() {
  const { data: stats, isLoading: statsLoading } =
    api.youtube.getStats.useQuery();
  const { data: diet, isLoading: dietLoading } =
    api.youtube.getInformationDietSummary.useQuery();

  if (statsLoading || dietLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!stats || !diet) return null;

  const currentHours = diet.current.exposureSeconds / 3600;
  const priorHours = diet.prior.exposureSeconds / 3600;
  const lifetimeHours = stats.totalEstimatedExposureSeconds / 3600;
  const since = stats.earliestWatch
    ? new Date(stats.earliestWatch).getFullYear()
    : null;

  type Tile = {
    label: string;
    icon: Icon;
    value: string;
    score?: number | null;
    coverage?: number | null;
    sub: ReactNode;
    hasDelta: boolean;
    percentile: string | null;
    spark: ReactNode;
  };

  const tiles: Tile[] = [
    {
      label: "Watch time",
      icon: ClockIcon,
      value: `${currentHours.toFixed(1)} hrs`,
      sub: <DeltaLine current={currentHours} prior={priorHours} unit=" hrs" />,
      hasDelta: true,
      percentile: describePercentile(
        diet.percentiles.watchHours,
        "30-day stretches",
      ),
      spark: (
        <HoursSparkline
          daily={diet.daily}
          reference={priorHours > 0 ? priorHours / diet.daily.length : null}
        />
      ),
    },
    {
      label: "Learning value",
      icon: StudentIcon,
      value:
        diet.current.learningValue === null
          ? "—"
          : diet.current.learningValue.toFixed(1),
      score: diet.current.learningValue,
      coverage: diet.current.learningCoverage,
      sub: (
        <DeltaLine
          current={diet.current.learningValue}
          prior={diet.prior.learningValue}
        />
      ),
      hasDelta:
        diet.current.learningValue !== null &&
        diet.prior.learningValue !== null,
      percentile: describePercentile(
        diet.percentiles.learningValue,
        "30-day stretches",
      ),
      spark: (
        <ScoreSparkline
          points={diet.daily.map((day) => day.learningValue)}
          reference={diet.prior.learningValue}
          dimension="learning value"
          className="stroke-blue-500"
        />
      ),
    },
    {
      label: "Positivity",
      icon: SmileyIcon,
      value:
        diet.current.positivity === null
          ? "—"
          : diet.current.positivity.toFixed(1),
      score: diet.current.positivity,
      coverage: diet.current.positivityCoverage,
      sub: (
        <DeltaLine
          current={diet.current.positivity}
          prior={diet.prior.positivity}
        />
      ),
      hasDelta:
        diet.current.positivity !== null && diet.prior.positivity !== null,
      percentile: describePercentile(
        diet.percentiles.positivity,
        "30-day stretches",
      ),
      spark: (
        <ScoreSparkline
          points={diet.daily.map((day) => day.positivity)}
          reference={diet.prior.positivity}
          dimension="positivity"
          className="stroke-green-600 dark:stroke-green-500"
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-rounded text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Last 30 days
        </h2>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {stats.totalVideos.toLocaleString()} videos,{" "}
          {Math.round(lifetimeHours).toLocaleString()} hrs
          {since ? ` since ${since}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => {
          const thin =
            tile.coverage != null && tile.coverage < COVERAGE_NOTE_THRESHOLD;
          return (
            <div
              key={tile.label}
              className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <p className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                <tile.icon className="h-4 w-4" weight="bold" />
                {tile.label}
              </p>
              <p
                className={
                  "mt-1 font-rounded text-2xl font-semibold " +
                  (tile.score === undefined
                    ? "text-neutral-800 dark:text-neutral-100"
                    : scoreTextClass(tile.score))
                }
              >
                {tile.value}
              </p>
              {tile.spark}
              <div className="mt-auto pt-2 text-xs text-neutral-400 dark:text-neutral-500">
                <p>
                  {tile.sub}
                  {thin && (
                    <>
                      {tile.hasDelta ? " · " : ""}
                      {Math.round((tile.coverage ?? 0) * 100)}% of hours scored
                    </>
                  )}
                </p>
                {tile.percentile && (
                  <p className="first-letter:uppercase">{tile.percentile}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
