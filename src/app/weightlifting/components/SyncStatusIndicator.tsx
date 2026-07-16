"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { formatRelativeTime, QUERY_STALE_TIME } from "../lib/utils";

export function SyncStatusIndicator() {
  const { data } = api.weightlifting.getSyncStatus.useQuery(undefined, {
    staleTime: QUERY_STALE_TIME,
  });

  if (!data?.lastSuccess?.syncCompletedAt) return null;

  const { latest, lastSuccess } = data;
  const failed = latest?.status === "failed";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex cursor-default items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {failed && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
            Synced {formatRelativeTime(lastSuccess.syncCompletedAt!)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="font-sans">
          <div className="space-y-0.5">
            <p>
              {new Date(lastSuccess.syncCompletedAt!).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {lastSuccess.triggeredBy}
            </p>
            <p className="text-muted-foreground">
              {lastSuccess.totalWorkouts?.toLocaleString()} workouts ·{" "}
              {lastSuccess.totalSets?.toLocaleString()} sets
            </p>
            {failed && (
              <p className="text-amber-600 dark:text-amber-500">
                Last sync attempt failed
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
