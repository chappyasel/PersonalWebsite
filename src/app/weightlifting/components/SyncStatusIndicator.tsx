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

  // Prefer the phone's upload time (the actual sync); fall back to when
  // the server ingested the data if S3 metadata is unavailable
  const syncedAt = data?.phoneSyncedAt ?? data?.dataReceivedAt;
  if (!data || !syncedAt) return null;

  const { latest, lastSuccess, dataReceivedAt, latestWorkoutAt } = data;
  const failed = latest?.status === "failed";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex cursor-default items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {failed && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
            Synced {formatRelativeTime(syncedAt)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="font-sans">
          <div className="space-y-0.5">
            <p>
              Phone synced{" "}
              {new Date(syncedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            {latestWorkoutAt && (
              <p className="text-muted-foreground">
                Last workout{" "}
                {new Date(latestWorkoutAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
            {dataReceivedAt && (
              <p className="text-muted-foreground">
                Ingested {formatRelativeTime(dataReceivedAt)} ·{" "}
                {lastSuccess?.triggeredBy}
              </p>
            )}
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
