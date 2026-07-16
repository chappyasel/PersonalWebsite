"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { categoryColor, QUERY_STALE_TIME } from "../lib/utils";
import { QueryErrorFallback } from "./QueryErrorFallback";

interface PersonalRecordsProps {
  selectedExercises: string[];
}

export function PersonalRecords({ selectedExercises }: PersonalRecordsProps) {
  const {
    data: records,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getPersonalRecords.useQuery(undefined, {
    staleTime: QUERY_STALE_TIME,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <QueryErrorFallback
        label="personal records"
        onRetry={() => void refetch()}
      />
    );
  }

  if (!records || records.length === 0) {
    return <p className="text-sm text-neutral-500">No records found.</p>;
  }

  const filtered = records.filter((r) =>
    selectedExercises.includes(r.exerciseName),
  );
  const sorted = [...filtered].sort((a, b) => b.bestOneRM - a.bestOneRM);

  return (
    <div className="-mb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            <th className="pb-2 pr-4 font-medium">Exercise</th>
            <th className="pb-2 pr-4 text-right font-medium">Est. 1RM</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((record) => (
            <tr
              key={record.exerciseName}
              className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-700/50"
            >
              <td className="py-2 pr-4">
                <span className="flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(record.category) }}
                  />
                  {record.exerciseName}
                </span>
                <span className="ml-[18px] text-xs text-neutral-400 dark:text-neutral-500">
                  {record.instanceCount} instance{record.instanceCount !== 1 ? "s" : ""}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                <div className="text-neutral-600 dark:text-neutral-300">
                  {Math.round(record.bestOneRM)} lbs
                </div>
                <div className="text-xs text-neutral-400 dark:text-neutral-500">
                  {record.reps}x{record.weight}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
