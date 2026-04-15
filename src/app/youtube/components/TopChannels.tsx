"use client";

import { useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { TimeRangeToggle, type TimeRange } from "./TimeRangeToggle";

function qualityBarColor(score: number): string {
  if (score >= 0.5) return "bg-green-500/15 dark:bg-green-400/15";
  if (score >= 0.15) return "bg-yellow-500/15 dark:bg-yellow-400/15";
  return "bg-red-500/10 dark:bg-red-400/10";
}

function qualityColor(score: number): string {
  if (score >= 0.5) return "text-green-600 dark:text-green-400";
  if (score >= 0.15) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function qualityBgColor(score: number): string {
  if (score >= 0.5) return "bg-green-500";
  if (score >= 0.15) return "bg-yellow-500";
  return "bg-red-500";
}

/** Mini inline range bar: shows mean with min-max whiskers on a 0-1 scale */
function QualityRange({
  mean,
  min,
  max,
  stddev,
}: {
  mean: number;
  min: number;
  max: number;
  stddev: number;
}) {
  const width = 48; // px

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`text-[10px] font-semibold tabular-nums ${qualityColor(mean)}`}
      >
        {mean.toFixed(2)}
      </span>
      <div
        className="relative h-2 rounded-full bg-neutral-100 dark:bg-neutral-700"
        style={{ width }}
        title={`Mean: ${mean.toFixed(2)}, Std: ${stddev.toFixed(2)}, Range: ${min.toFixed(2)}–${max.toFixed(2)}`}
      >
        {/* Min-max range whisker */}
        {max > min && (
          <div
            className="absolute top-0.5 h-1 rounded-full bg-neutral-300 dark:bg-neutral-500"
            style={{
              left: `${min * 100}%`,
              width: `${(max - min) * 100}%`,
            }}
          />
        )}
        {/* Mean dot */}
        <div
          className={`absolute top-0 h-2 w-2 rounded-full ${qualityBgColor(mean)}`}
          style={{
            left: `${mean * 100}%`,
            transform: "translateX(-50%)",
          }}
        />
      </div>
    </div>
  );
}

export function TopChannels() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = api.youtube.getTopChannels.useQuery({
    limit: expanded ? 50 : 10,
    timeRange,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-md" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No channel data yet
      </p>
    );
  }

  const maxHours = data[0]?.totalHours ?? 1;

  return (
    <div>
      <div className="mb-3">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>
      <div className="space-y-1.5">
        {data.map((ch, i) => (
          <div key={ch.channelName} className="flex items-center gap-3">
            <span className="w-5 text-right text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
              {i + 1}
            </span>
            <div className="relative flex-1">
              <div
                className={`absolute inset-y-0 left-0 rounded-md ${qualityBarColor(ch.qualityMean)}`}
                style={{ width: `${(ch.totalHours / maxHours) * 100}%` }}
              />
              <div className="relative flex items-center px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {ch.channelName}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <QualityRange
                    mean={ch.qualityMean}
                    min={ch.qualityMin}
                    max={ch.qualityMax}
                    stddev={ch.qualityStddev}
                  />
                  <span className="w-[52px] text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {ch.totalHours.toFixed(1)}h
                  </span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 w-full rounded-md py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
