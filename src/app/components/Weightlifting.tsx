"use client";

import { LastWorkoutContent } from "../weightlifting/components/LastWorkoutContent";
import { exerciseSlug } from "../weightlifting/lib/exerciseSlug";
import { categoryColor } from "../weightlifting/lib/utils";
import {
  BarbellIcon,
  CalendarDotsIcon,
  TrophyIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { devSubdomainUrl } from "~/lib/util";
import { activityCalendarMonths } from "~/lib/weightlifting/activityCalendar";
import { HOME_LAST_WORKOUT_ENABLED } from "~/lib/weightlifting/features";
import type {
  ActivityMosaicData,
  WeightliftingPlacardData,
} from "~/server/queries/weightlifting";

import SheetLink from "~/components/modal-sheet/SheetLink";
import { Button } from "~/components/ui/button";
import { IntersectionMotion } from "~/components/ui/intersection-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import styles from "./Weightlifting.module.css";
import {
  PlacardCardHeading,
  PlacardLinkCard,
  PlacardNestedLinkCard,
} from "./stacks/dom/PlacardStatsCard";
import { WorkoutStatsCard, formatVolume } from "./stacks/dom/statsCards";

function categoryLabel(categories: Record<string, number>) {
  const entries = Object.entries(categories);
  if (entries.length === 0) return "Workout";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category} ${count}`)
    .join(" / ");
}

function categoryBackground(categories: Record<string, number>) {
  const entries = Object.entries(categories).filter(([, count]) => count > 0);
  if (entries.length === 0) return "hsl(var(--foreground))";

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let cursor = 0;
  const stops = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => {
      const start = cursor;
      cursor += (count / total) * 100;
      const color = categoryColor(category);
      return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function WorkoutHistoryCalendar({ data }: { data: ActivityMosaicData }) {
  const months = useMemo(
    () =>
      data.endDate ? activityCalendarMonths(data.endDate, data.months) : [],
    [data.endDate, data.months],
  );
  const dayMap = useMemo(
    () => new Map(data.days.map((day) => [day.date, day])),
    [data.days],
  );
  if (!data.endDate) {
    return (
      <p className="homepage-card-body text-muted-foreground">
        Workout history is unavailable.
      </p>
    );
  }
  return (
    <div>
      <TooltipProvider delayDuration={150}>
        <div className={styles.months}>
          {months.map((month) => (
            <div
              key={month.key}
              className={styles.month}
              role="group"
              aria-label={month.fullLabel}
            >
              <h4 className="text-center text-[11px] font-bold leading-none text-foreground/80">
                {month.label}
              </h4>
              <div className={styles.days}>
                {month.days.map((day) => {
                  const workout = dayMap.get(day.key);
                  const future = day.key > data.endDate!;
                  const active = !future && (workout?.workoutCount ?? 0) > 0;
                  const detail = future
                    ? "Upcoming"
                    : active && workout
                      ? `${workout.workoutCount} workout${workout.workoutCount === 1 ? "" : "s"} · ${formatVolume(workout.volume)} lbs · ${categoryLabel(workout.categories)}`
                      : "Rest";
                  const label = new Date(
                    `${day.key}T00:00:00Z`,
                  ).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  });
                  return (
                    <Tooltip key={day.key} allowTapFirst>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          data-date={day.key}
                          aria-label={`${label}: ${detail}`}
                          tabIndex={active ? 0 : -1}
                          className={`relative grid size-full grid-cols-1 grid-rows-[7px_4.8px] gap-px rounded-full p-0 font-serif text-[7px] tabular-nums leading-none hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45 ${future ? "text-muted-foreground/40" : "text-foreground"} ${active ? "transition-transform duration-200 hover:scale-125 motion-reduce:transform-none" : ""}`}
                          style={{ gridColumn: day.column, gridRow: day.row }}
                        >
                          <span aria-hidden className="opacity-60">
                            {day.day}
                          </span>
                          <span
                            aria-hidden
                            className="h-[4.8px] w-full rounded-full"
                            style={{
                              background:
                                active && workout
                                  ? categoryBackground(workout.categories)
                                  : "hsl(var(--foreground))",
                              opacity: future
                                ? 0
                                : active && workout
                                  ? 0.25 +
                                    0.75 *
                                      (data.maxVolume > 0
                                        ? Math.max(
                                            0.24,
                                            Math.min(
                                              1,
                                              workout.volume / data.maxVolume,
                                            ),
                                          )
                                        : 1)
                                  : 0.08,
                            }}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        sideOffset={8}
                        className="max-w-56 space-y-1 rounded-xl px-2.5 py-2 font-sans text-[11px] leading-snug"
                      >
                        <p className="font-semibold text-inherit">
                          {new Date(`${day.key}T00:00:00Z`).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            },
                          )}
                        </p>
                        {active && workout ? (
                          <>
                            <p className="text-inherit opacity-80">
                              {workout.workoutCount}{" "}
                              {workout.workoutCount === 1
                                ? "workout"
                                : "workouts"}
                              {" · "}
                              {formatVolume(workout.volume)} lbs lifted
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-inherit">
                              {Object.entries(workout.categories)
                                .filter(([, count]) => count > 0)
                                .sort((a, b) => b[1] - a[1])
                                .map(([category, count]) => (
                                  <span
                                    key={category}
                                    className="inline-flex items-center gap-1"
                                  >
                                    <span
                                      aria-hidden
                                      className="size-1.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          categoryColor(category),
                                      }}
                                    />
                                    {category} ×{count}
                                  </span>
                                ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-inherit opacity-80">{detail}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function FeaturedRecords({ data }: { data: WeightliftingPlacardData }) {
  return (
    <div>
      <PlacardCardHeading
        icon={TrophyIcon}
        detail="Estimated 1RM"
        className="mb-1"
      >
        The big three
      </PlacardCardHeading>
      <div className="-mb-2 divide-y divide-foreground/10">
        {data.records.map((record) => (
          <div key={record.key} className="group/record">
            <SheetLink
              href={`/weightlifting/${exerciseSlug(record.exerciseName)}`}
              className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-2 py-3.5 transition-colors duration-200 group-last/record:pb-2 hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/45"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: record.category
                      ? categoryColor(record.category)
                      : "hsl(var(--foreground))",
                  }}
                />
                <div className="min-w-0">
                  <strong
                    data-featured-record-text=""
                    className="block font-serif homepage-card-body font-semibold text-foreground"
                  >
                    {record.exerciseName}
                  </strong>
                  <span className="block truncate homepage-card-meta text-muted-foreground">
                    {record.achievedDate ? (
                      <time dateTime={record.achievedDate}>
                        {new Date(
                          `${record.achievedDate}T00:00:00Z`,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                    ) : (
                      "No record yet"
                    )}
                  </span>
                </div>
              </div>
              <div className="text-right tabular-nums">
                <strong
                  data-featured-record-text=""
                  className="block homepage-card-body font-semibold text-foreground"
                >
                  {record.bestOneRM === null
                    ? "—"
                    : `${Math.round(record.bestOneRM)} lbs`}
                </strong>
                {record.reps !== null && record.weight !== null ? (
                  <span className="block homepage-card-meta text-muted-foreground">
                    {record.reps} × {record.weight}
                  </span>
                ) : null}
              </div>
            </SheetLink>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Weightlifting({
  activity,
  data,
}: {
  activity: ActivityMosaicData;
  data: WeightliftingPlacardData;
}) {
  const href =
    process.env.NODE_ENV === "production"
      ? "https://weightlifting.chappyasel.com"
      : devSubdomainUrl("weightlifting");

  return (
    <section
      data-homepage-lifting
      className="placard-card-stack flex w-full flex-col items-center justify-around gap-4"
    >
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <BarbellIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Weightlifting
      </h1>
      <IntersectionMotion className="placard-card-stack flex w-full flex-col gap-4 intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
        <PlacardLinkCard
          href={href}
          label="Browse weightlifting statistics"
          mobileCompact
        >
          <WorkoutStatsCard data={data} />
        </PlacardLinkCard>
        {HOME_LAST_WORKOUT_ENABLED && data.latestWorkout && (
          <PlacardLinkCard
            href={`${href}/workout/${encodeURIComponent(data.latestWorkout.uuid)}`}
            label={`View last workout: ${data.latestWorkout.name}, ${data.latestWorkout.date}`}
          >
            <LastWorkoutContent workout={data.latestWorkout} />
          </PlacardLinkCard>
        )}
        <PlacardNestedLinkCard href={href} label="Browse featured lift records">
          <FeaturedRecords data={data} />
        </PlacardNestedLinkCard>
        <PlacardNestedLinkCard
          href={href}
          label="Browse the full workout history"
        >
          <PlacardCardHeading icon={CalendarDotsIcon} detail="Last 12 mo">
            Workout history
          </PlacardCardHeading>
          <WorkoutHistoryCalendar data={activity} />
        </PlacardNestedLinkCard>
      </IntersectionMotion>
    </section>
  );
}
