"use client";

import { categoryColor } from "../lib/utils";
import {
  splitShortened,
  wlaSetDescription,
  workoutDateLabel,
} from "../lib/wlaFormat";
import type { WorkoutPreviewTarget } from "../lib/workoutKey";
import {
  BarbellIcon,
  ClockIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { recordModalOrigin } from "~/lib/originFlight";
import { type RouterOutputs, api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { QueryErrorFallback } from "./QueryErrorFallback";

type WorkoutPreviewData =
  RouterOutputs["weightlifting"]["getWorkoutPreview"][number];
type Exercise = WorkoutPreviewData["exercises"][number];

/**
 * Partition a workout's exercises into consecutive runs sharing a superset
 * group (already parsed server-side to exercise-order groups). Groups with
 * fewer than 2 members are dropped; runs that end up with a single exercise
 * render as normal cards.
 */
function partitionSupersets(workout: WorkoutPreviewData) {
  const groupByOrder = new Map<number, number>();
  workout.supersets.forEach((orders, groupIndex) => {
    const valid = orders.filter((n) => Number.isInteger(n) && n >= 0);
    if (valid.length < 2) return;
    for (const order of valid) groupByOrder.set(order, groupIndex);
  });

  const runs: { groupId: number | null; exercises: Exercise[] }[] = [];
  for (const exercise of workout.exercises) {
    const groupId = groupByOrder.get(exercise.order) ?? null;
    const last = runs[runs.length - 1];
    if (last && groupId !== null && last.groupId === groupId) {
      last.exercises.push(exercise);
    } else {
      runs.push({ groupId, exercises: [exercise] });
    }
  }
  return runs;
}

/**
 * One exercise row inside a card, mirroring ExercisesCellChildView: name in
 * plain medium gray, the set-chip grid below, and an 80px category color
 * block spanning the row's full height on the right. A superset renders as
 * ONE card with these rows stacked, the color blocks tiling down the edge.
 */
function ExerciseRow({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1 py-2 pl-3 pr-2.5">
        {exercise.slug ? (
          <Link
            href={`/weightlifting/${exercise.slug}`}
            onClick={(event) =>
              recordModalOrigin(event.currentTarget.getBoundingClientRect())
            }
            className="text-[17px] font-medium text-neutral-600 underline decoration-transparent underline-offset-2 transition-colors hover:decoration-neutral-400 dark:text-neutral-200 dark:hover:decoration-neutral-400"
          >
            {exercise.displayName}
          </Link>
        ) : (
          <p className="text-[17px] font-medium text-neutral-600 dark:text-neutral-200">
            {exercise.displayName}
          </p>
        )}
        {exercise.sets.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5 pb-0.5">
            {exercise.sets.map((set, j) => (
              <span
                key={j}
                className="inline-block min-w-16 rounded-md bg-white px-1.5 py-[3px] text-center text-[10px] font-semibold tabular-nums leading-none text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
              >
                {wlaSetDescription(set, exercise.style)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 pb-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">
            No sets
          </p>
        )}
      </div>
      <span
        className="flex w-20 shrink-0 items-center justify-center text-center text-[13px] font-semibold leading-tight text-white"
        style={{
          backgroundColor: categoryColor(exercise.category),
        }}
      >
        {exercise.category}
      </span>
    </div>
  );
}

/**
 * The workout preview's whole body — query, loading/error states, and the
 * WLA-parity cards — shared by the full /workout/[key] page and its
 * intercepted card sheet. Chrome (close, expand, backdrop) belongs to the
 * caller.
 */
export function WorkoutPreview({ target }: { target: WorkoutPreviewTarget }) {
  const {
    data: workouts,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getWorkoutPreview.useQuery(target);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (isError) {
    return (
      <QueryErrorFallback
        label="workout details"
        onRetry={() => void refetch()}
      />
    );
  }
  if (!workouts || workouts.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500">
        No workouts found for this date.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 font-medium">
      {workouts.map((workout) => {
        const totalSets = workout.exercises.reduce(
          (sum, e) => sum + e.sets.length,
          0,
        );
        const totalVolume = workout.exercises.reduce(
          (sum, e) => sum + e.sets.reduce((s, set) => s + (set.volume ?? 0), 0),
          0,
        );

        const volume = splitShortened(totalVolume);
        return (
          <div key={workout.id}>
            <div className="mb-1 text-center">
              <h3 className="font-rounded text-2xl font-bold text-neutral-600 dark:text-neutral-100">
                {workout.name}
              </h3>
              <p className="font-rounded text-base font-bold text-neutral-400 dark:text-neutral-500">
                {workoutDateLabel(workout.ts)}
              </p>
            </div>

            <div className="mb-4 mt-3 flex justify-center gap-6 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
              <div className="text-center">
                <p className="font-rounded text-xl font-bold text-neutral-600 dark:text-neutral-100">
                  {totalSets}
                </p>
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <SquaresFourIcon className="h-3 w-3" weight="bold" />
                  Sets
                </p>
              </div>
              <div className="text-center">
                <p className="font-rounded text-xl font-bold text-neutral-600 dark:text-neutral-100">
                  {volume.main}
                  <span className="text-sm font-semibold">
                    {volume.suffix} lbs
                  </span>
                </p>
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <BarbellIcon className="h-3 w-3" weight="bold" />
                  Volume
                </p>
              </div>
              <div className="text-center">
                <p className="font-rounded text-xl font-bold text-neutral-600 dark:text-neutral-100">
                  {Math.max(1, Math.floor(workout.durationSeconds / 60))}
                  <span className="text-sm font-semibold"> mins</span>
                </p>
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <ClockIcon className="h-3 w-3" weight="bold" />
                  Duration
                </p>
              </div>
            </div>

            {/* One card per superset run; a superset's rows stack inside a
                single card, color blocks tiling the right edge
                (ExercisesTableViewCell) */}
            <div className="space-y-2">
              {partitionSupersets(workout).map((run, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800"
                >
                  {run.exercises.map((exercise) => (
                    <ExerciseRow key={exercise.order} exercise={exercise} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
