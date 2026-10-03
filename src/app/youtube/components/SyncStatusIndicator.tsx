"use client";

import { formatRelativeTime } from "~/lib/util";
import { DISPLAY_TIME_ZONE, watchDayOf } from "~/lib/youtube/coverageWindow";
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

/** A watch-day key (YYYY-MM-DD) is a date, not an instant, so read it in UTC
 *  or it slips back a day west of Greenwich. */
function formatWatchDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The export's build time, to the minute: it lands partway through a
 *  watch-day, which is why that day is not yet complete. */
function formatExportTime(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function SyncStatusIndicator() {
  const { data } = api.youtube.getSyncStatus.useQuery(undefined, {
    staleTime: QUERY_STALE_TIME,
  });
  if (!data?.coveredThrough || !data.lastCoveredDay) return null;

  const {
    latest,
    lastSuccess,
    ingestedAt,
    exportCreatedAt,
    latestWatchAt,
    coveredThrough,
    lastCoveredDay,
  } = data;
  const failed = latest?.status === "failed";
  // Google builds the archive; every watch-day it saw from start to finish is
  // accounted for, including the days Chappy watched nothing. The last watch
  // event is a separate fact and often days earlier.
  const quietDays = latestWatchAt
    ? Math.max(
        0,
        (Date.parse(lastCoveredDay) -
          Date.parse(watchDayOf(new Date(latestWatchAt)))) /
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
            Complete through {formatWatchDay(lastCoveredDay)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="font-sans">
          <div className="space-y-0.5">
            <p>
              {exportCreatedAt
                ? `Takeout export built ${formatExportTime(exportCreatedAt)}`
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
