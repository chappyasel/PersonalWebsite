"use client";

import Image from "next/image";
import { useState } from "react";

import { scoreTextClass } from "~/lib/youtube/dashboard";
import { api } from "~/trpc/react";

import { Skeleton } from "~/components/ui/skeleton";

import { type TimeRange, TimeRangeToggle } from "./TimeRangeToggle";

function InitialAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ChannelAvatar({
  name,
  thumbnailUrl,
}: {
  name: string;
  thumbnailUrl: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative h-8 w-8 shrink-0">
      <span className="absolute inset-0">
        <InitialAvatar name={name} />
      </span>
      {thumbnailUrl && !failed && (
        <Image
          src={thumbnailUrl}
          alt=""
          width={32}
          height={32}
          className={
            "absolute inset-0 h-8 w-8 rounded-full object-cover transition-opacity duration-200 " +
            (loaded ? "opacity-100" : "opacity-0")
          }
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </span>
  );
}

function Score({
  label,
  value,
  coverage,
}: {
  label: string;
  value: number | null;
  coverage: number | null;
}) {
  return (
    <span
      aria-label={`${label}: ${value?.toFixed(1) ?? "Unscored"}${coverage == null ? "" : ` (${Math.round(coverage * 100)}% coverage)`}`}
      className={"w-9 text-right text-xs tabular-nums " + scoreTextClass(value)}
    >
      {value?.toFixed(1) ?? "—"}
    </span>
  );
}

export function TopChannels() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = api.youtube.getInformationDietChannels.useQuery({
    limit: expanded ? 50 : 10,
    timeRange,
  });
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 rounded-md" />
        ))}
      </div>
    );
  }
  if (!data?.length)
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        No channel data yet
      </p>
    );
  const maxHours = data[0]?.estimatedExposureHours ?? 1;
  return (
    <div>
      <div className="mb-3">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>
      <div className="mb-1 flex justify-end gap-2 px-2 text-[10px] uppercase tracking-wide text-neutral-400">
        <span className="w-9 text-right">Learn</span>
        <span className="w-9 text-right">Pos</span>
        <span className="w-14 text-right">Time</span>
      </div>
      <div className="space-y-1.5">
        {data.map((channel, index) => (
          <div key={channel.channelId} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs tabular-nums text-neutral-400">
              {index + 1}
            </span>
            <ChannelAvatar
              name={channel.channelName}
              thumbnailUrl={channel.thumbnailUrl}
            />
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
              <div
                className="absolute inset-y-0 left-0 bg-neutral-500/20 dark:bg-neutral-300/15"
                style={{
                  width: `${(channel.estimatedExposureHours / maxHours) * 100}%`,
                }}
              />
              <div className="relative flex items-center gap-2 px-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {channel.channelName}
                </span>
                <Score
                  label="Learning Value"
                  value={channel.learningValue}
                  coverage={channel.learningCoverage}
                />
                <Score
                  label="Positivity"
                  value={channel.positivity}
                  coverage={channel.positivityCoverage}
                />
                <span className="w-14 text-right text-xs tabular-nums text-neutral-500">
                  {channel.estimatedExposureHours.toFixed(1)}h
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 w-full rounded-md py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
