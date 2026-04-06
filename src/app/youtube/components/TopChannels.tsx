"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export function TopChannels() {
  const { data, isLoading } = api.youtube.getTopChannels.useQuery({
    limit: 15,
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
    <div className="space-y-1.5">
      {data.map((ch, i) => (
        <div key={ch.channelName} className="flex items-center gap-3">
          <span className="w-5 text-right text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
            {i + 1}
          </span>
          <div className="relative flex-1">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-red-500/10 dark:bg-red-400/10"
              style={{ width: `${(ch.totalHours / maxHours) * 100}%` }}
            />
            <div className="relative flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {ch.channelName}
              </span>
              <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {ch.totalHours.toFixed(1)}h
                <span className="ml-1.5 text-neutral-400 dark:text-neutral-500">
                  ({ch.videoCount})
                </span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
