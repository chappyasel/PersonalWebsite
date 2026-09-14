"use client";

import { exerciseLastUsed } from "../lib/exerciseDirectory";
import { useWlPath } from "../lib/paths";
import { wlaSetDescription } from "../lib/wlaFormat";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { api } from "~/trpc/react";

import SheetLink from "~/components/modal-sheet/SheetLink";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";

import { QueryErrorFallback } from "./QueryErrorFallback";

export function ExerciseHistory({
  displayName,
  allVariants = false,
}: {
  displayName: string;
  allVariants?: boolean;
}) {
  const path = useWlPath();
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, refetch } =
    api.weightlifting.getExerciseOccurrences.useQuery({
      displayName: displayName,
      offset,
      allVariants,
    });
  return (
    <div className="space-y-3 pb-2">
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : isError ? (
        <QueryErrorFallback
          label="exercise history"
          onRetry={() => void refetch()}
        />
      ) : data?.instances.length ? (
        <>
          <div className="space-y-2">
            {data.instances.map((instance) => (
              <SheetLink
                key={`${instance.workoutUuid}:${instance.order}`}
                href={path(
                  `/workout/${encodeURIComponent(instance.workoutUuid)}`,
                )}
                aria-label={`Open ${instance.workoutName}, ${exerciseLastUsed(instance.ts)}`}
                className="block rounded-lg bg-neutral-50 p-3 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 dark:bg-neutral-900/40 dark:hover:bg-neutral-900/70"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    <time dateTime={instance.ts}>
                      {exerciseLastUsed(instance.ts)}
                    </time>
                    <span className="ml-2 text-muted-foreground">
                      {instance.workoutName}
                    </span>
                  </span>
                  <CaretRightIcon aria-hidden className="size-3 shrink-0" />
                </div>
                {allVariants && (
                  <p className="mt-2 text-sm font-medium">
                    {instance.displayName}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {instance.sets.length ? (
                    instance.sets.map((set, index) => (
                      <span
                        key={index}
                        className="rounded-md bg-neutral-200/60 px-2 py-1 text-xs tabular-nums dark:bg-neutral-700/60"
                      >
                        {wlaSetDescription(set, instance.style)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No sets logged
                    </span>
                  )}
                </div>
              </SheetLink>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Instances {offset + 1}–{offset + data.instances.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 10))}
              >
                <CaretLeftIcon aria-hidden className="mr-1 size-3" />
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.hasMore}
                onClick={() => setOffset(offset + 10)}
              >
                Older
                <CaretRightIcon aria-hidden className="ml-1 size-3" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No instances found.</p>
      )}
    </div>
  );
}
