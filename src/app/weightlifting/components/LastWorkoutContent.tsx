import { categoryColor } from "../lib/utils";
import { shortenValue, wlaSetDescription } from "../lib/wlaFormat";
import {
  BarbellIcon,
  CalendarCheckIcon,
  CaretRightIcon,
  ClockIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties } from "react";

import { partitionWorkoutSupersets } from "~/lib/weightlifting/workoutGroups";
import type { LatestWorkoutData } from "~/server/queries/latestWorkout";

import { Card } from "~/components/ui/card";

/** Shared workout content inside each page's existing card and link. */
export function LastWorkoutContent({
  workout,
}: {
  workout: LatestWorkoutData;
}) {
  const date = new Date(`${workout.date}T00:00:00Z`).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  );
  const stats = [
    {
      label: "Sets",
      value: workout.setCount.toLocaleString("en-US"),
      icon: SquaresFourIcon,
    },
    {
      label: "Volume",
      value: shortenValue(workout.volume),
      unit: "lbs",
      icon: BarbellIcon,
    },
    {
      label: "Duration",
      value:
        workout.durationSeconds === null
          ? "—"
          : String(Math.floor(workout.durationSeconds / 60)),
      unit: workout.durationSeconds === null ? undefined : "mins",
      icon: ClockIcon,
    },
  ];
  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CalendarCheckIcon aria-hidden className="size-5 shrink-0" />
          Last workout
        </h3>
        <CaretRightIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </div>
      <div className="text-center">
        <p className="font-serif text-2xl leading-tight text-foreground">
          {workout.name}
        </p>
        <time
          dateTime={workout.date}
          className="mt-1 block text-xs text-muted-foreground"
        >
          {date}
        </time>
      </div>
      <Card className="my-4 rounded-2xl border-0 bg-foreground/[0.04] px-2 py-3 shadow-none">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {stats.map(({ label, value, unit, icon: Icon }) => (
            <div key={label} className="flex min-w-0 flex-col-reverse gap-1">
              <dt className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
                <Icon aria-hidden className="size-3 shrink-0" />
                {label}
              </dt>
              <dd className="font-serif text-2xl tabular-nums leading-none text-foreground">
                {value}
                {unit && (
                  <span className="ml-1 font-sans text-[10px] font-medium">
                    {unit}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="space-y-2">
        {partitionWorkoutSupersets(workout).map((group) => (
          <Card
            key={group.exercises[0]!.order}
            className="overflow-hidden rounded-2xl border-foreground/[0.06] bg-foreground/[0.025] shadow-none"
          >
            {group.exercises.map((exercise) => (
              <div key={exercise.order} className="flex items-stretch">
                <div className="min-w-0 flex-1 p-3">
                  <p className="font-serif text-base leading-snug text-foreground">
                    {exercise.displayName}
                  </p>
                  {exercise.sets.length > 0 ? (
                    <div
                      className={`mt-2 grid gap-1.5 ${exercise.style === "reps_weight" || exercise.style === "reps" ? "grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(6rem,1fr))]"}`}
                    >
                      {exercise.sets.map((set, index) => (
                        <span
                          key={index}
                          className="rounded-md bg-foreground/[0.07] px-1.5 py-1 text-center text-[10px] font-medium tabular-nums leading-tight text-foreground/80"
                        >
                          {wlaSetDescription(set, exercise.style)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No sets
                    </p>
                  )}
                </div>
                <span
                  className="flex w-16 shrink-0 items-center justify-center border-l-2 border-[var(--workout-category)] bg-[color-mix(in_srgb,var(--workout-category)_14%,transparent)] px-1.5 text-center text-[10px] font-medium leading-tight text-foreground sm:w-20 sm:text-xs"
                  style={
                    {
                      "--workout-category": categoryColor(exercise.category),
                    } as CSSProperties
                  }
                >
                  {exercise.category}
                </span>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
