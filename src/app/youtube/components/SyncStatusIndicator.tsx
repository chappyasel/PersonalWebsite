"use client";

import { formatRelativeTime } from "~/lib/util";
import { api } from "~/trpc/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/** Match the weightlifting dashboard: keep server-prefetched status fresh past
 *  the first window focus without refetching on every mount. */
const QUERY_STALE_TIME = 30 * 60 * 1000;

function formatDay(value: string | Date) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SyncStatusIndicator() {
  const { data } = api.youtube.getSyncStatus.useQuery(undefined, {
    staleTime: QUERY_STALE_TIME,
  });
  if (!data?.coveredThrough) return null;

  const {
    latest,
    lastSuccess,
    ingestedAt,
    exportCreatedAt,
    latestWatchAt,
    coveredThrough,
  } = data;
  const failed = latest?.status === "failed";
  // Google builds the archive; everything up to that moment is accounted for,
  // including the days Chappy watched nothing. The last watch event is a
  // separate fact and often days earlier.
  const quietDays = latestWatchAt
    ? Math.floor(
        (new Date(coveredThrough).getTime() -
          new Date(latestWatchAt).getTime()) /
          86_400_000,
      )
    : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex cursor-default items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {failed && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
            Complete through {formatDay(coveredThrough)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="font-sans">
          <div className="space-y-0.5">
            <p>
              {exportCreatedAt
                ? `Takeout export built ${formatDay(exportCreatedAt)}`
                : `History reaches ${formatDay(coveredThrough)}`}
            </p>
            {latestWatchAt && (
              <p className="text-muted-foreground">
                Last watched {formatDay(latestWatchAt)}
                {quietDays > 0 &&
                  ` · ${quietDays} quiet ${quietDays === 1 ? "day" : "days"} since`}
              </p>
            )}
            {ingestedAt && (
              <p className="text-muted-foreground">
                Ingested {formatRelativeTime(ingestedAt)} ·{" "}
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
