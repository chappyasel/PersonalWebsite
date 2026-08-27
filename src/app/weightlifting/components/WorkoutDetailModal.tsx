"use client";

import { categoryColor } from "../lib/utils";
import {
  splitShortened,
  wlaSetDescription,
  workoutDateLabel,
} from "../lib/wlaFormat";
import {
  BarbellIcon,
  ClockIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { type RouterOutputs, api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { QueryErrorFallback } from "./QueryErrorFallback";

type WorkoutPreview =
  RouterOutputs["weightlifting"]["getWorkoutPreview"][number];
type Exercise = WorkoutPreview["exercises"][number];

/** Which workout(s) the preview shows: a calendar day or one workout. */
export type WorkoutPreviewTarget = { date: string } | { workoutUuid: string };

function formatDateLong(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Partition a workout's exercises into consecutive runs sharing a superset
 * group (already parsed server-side to exercise-order groups). Groups with
 * fewer than 2 members are dropped; runs that end up with a single exercise
 * render as normal cards.
 */
function partitionSupersets(workout: WorkoutPreview) {
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
function ExerciseRow({
  exercise,
  onNavigate,
}: {
  exercise: Exercise;
  onNavigate: () => void;
}) {
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1 py-2 pl-3 pr-2.5">
        {exercise.slug ? (
          <Link
            href={`/weightlifting/${exercise.slug}`}
            onClick={onNavigate}
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

function addOrdinalSuffix(dateStr: string) {
  return dateStr.replace(/(\d+)/, (_, d: string) => {
    const n = parseInt(d);
    if (n >= 11 && n <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  });
}

export function WorkoutDetailModal({
  target,
  onClose,
}: {
  target: WorkoutPreviewTarget | null;
  onClose: () => void;
}) {
  const isClosingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = target !== null;
  // The calendar's day cell shares a layoutId with the card so the modal
  // grows out of the clicked day; a workout-id open has no source cell
  const layoutDate = target && "date" in target ? target.date : null;

  const {
    data: workouts,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getWorkoutPreview.useQuery(
    target ?? { workoutUuid: "-" },
    { enabled: isOpen },
  );

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Move focus into the dialog on open, restore it on close
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    modalRef.current?.focus({ preventScroll: true });
    return () => {
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      if (e.key === "Escape") handleClose();
      if (e.key === "Tab") {
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          modal.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            document.activeElement === modal ||
            !modal.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else if (
          document.activeElement === last ||
          !modal.contains(document.activeElement)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm dark:bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />

            <div
              className="fixed inset-0 z-50 overflow-y-auto"
              onClick={handleClose}
            >
              <div className="flex min-h-full items-center justify-center p-4">
                <div
                  ref={modalRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    layoutDate
                      ? `Workouts on ${addOrdinalSuffix(
                          formatDateLong(`${layoutDate}T12:00:00Z`),
                        )}`
                      : "Workout details"
                  }
                  tabIndex={-1}
                  className="relative w-full max-w-[27.5rem] focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    layoutId={layoutDate ? `day-${layoutDate}` : undefined}
                    initial={
                      layoutDate ? undefined : { opacity: 0, scale: 0.95 }
                    }
                    animate={layoutDate ? undefined : { opacity: 1, scale: 1 }}
                    exit={layoutDate ? undefined : { opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 rounded-2xl border border-neutral-200 bg-white shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:border-neutral-700 dark:bg-neutral-900"
                    transition={{
                      layout: { type: "spring", stiffness: 300, damping: 30 },
                    }}
                  />

                  <motion.button
                    onClick={handleClose}
                    aria-label="Close"
                    className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: 0.1 }}
                  >
                    <XIcon className="h-4 w-4" weight="bold" />
                  </motion.button>

                  <motion.div
                    className="relative max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: 0.1 }}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center p-12">
                        <Spinner className="size-8" />
                      </div>
                    ) : isError ? (
                      <QueryErrorFallback
                        label="workout details"
                        onRetry={() => void refetch()}
                      />
                    ) : !workouts || workouts.length === 0 ? (
                      <div className="p-8 text-center text-sm text-neutral-500">
                        No workouts found for this date.
                      </div>
                    ) : (
                      <div className="space-y-6 p-5 font-medium">
                        {workouts.map((workout) => {
                          const totalSets = workout.exercises.reduce(
                            (sum, e) => sum + e.sets.length,
                            0,
                          );
                          const totalVolume = workout.exercises.reduce(
                            (sum, e) =>
                              sum +
                              e.sets.reduce(
                                (s, set) => s + (set.volume ?? 0),
                                0,
                              ),
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
                                    <SquaresFourIcon
                                      className="h-3 w-3"
                                      weight="bold"
                                    />
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
                                    <BarbellIcon
                                      className="h-3 w-3"
                                      weight="bold"
                                    />
                                    Volume
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="font-rounded text-xl font-bold text-neutral-600 dark:text-neutral-100">
                                    {Math.max(
                                      1,
                                      Math.floor(workout.durationSeconds / 60),
                                    )}
                                    <span className="text-sm font-semibold">
                                      {" "}
                                      mins
                                    </span>
                                  </p>
                                  <p className="flex items-center justify-center gap-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                                    <ClockIcon
                                      className="h-3 w-3"
                                      weight="bold"
                                    />
                                    Duration
                                  </p>
                                </div>
                              </div>

                              {/* One card per superset run; a superset's rows
                                stack inside a single card, color blocks
                                tiling the right edge (ExercisesTableViewCell) */}
                              <div className="space-y-2">
                                {partitionSupersets(workout).map((run, i) => (
                                  <div
                                    key={i}
                                    className="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800"
                                  >
                                    {run.exercises.map((exercise) => (
                                      <ExerciseRow
                                        key={exercise.order}
                                        exercise={exercise}
                                        onNavigate={handleClose}
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
