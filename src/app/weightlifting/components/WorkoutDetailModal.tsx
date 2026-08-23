"use client";

import { categoryColor, formatDuration, formatVolume } from "../lib/utils";
import {
  BarbellIcon,
  LinkSimpleIcon,
  SquaresFourIcon,
  TimerIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { type RouterOutputs, api } from "~/trpc/react";

import { Spinner } from "~/components/ui/spinner";

import { QueryErrorFallback } from "./QueryErrorFallback";

type Workout = RouterOutputs["weightlifting"]["getWorkouts"][number];
type Exercise = Workout["exercises"][number];

function formatSet(set: {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distance: number | null;
  custom: string | null;
}) {
  if (set.reps != null && set.weight != null)
    return `${set.reps}x${set.weight}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.durationSeconds != null) return formatDuration(set.durationSeconds);
  if (set.distance != null) return `${set.distance}mi`;
  if (set.custom) return set.custom;
  return "-";
}

function formatDateLong(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Partition a workout's exercises into consecutive runs sharing a superset
 * group. `supersets` holds space-separated exercise_order groups, e.g.
 * ["0 1", "2 3"]. Groups with fewer than 2 members are dropped; runs that
 * end up with a single exercise render as normal cards.
 */
function partitionSupersets(workout: Workout) {
  const groupByOrder = new Map<number, number>();
  workout.supersets.forEach((group, groupIndex) => {
    const orders = group
      .split(" ")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (orders.length < 2) return;
    for (const order of orders) groupByOrder.set(order, groupIndex);
  });

  const runs: { groupId: number | null; exercises: Exercise[] }[] = [];
  for (const exercise of workout.exercises) {
    const groupId = groupByOrder.get(exercise.exerciseOrder) ?? null;
    const last = runs[runs.length - 1];
    if (last && groupId !== null && last.groupId === groupId) {
      last.exercises.push(exercise);
    } else {
      runs.push({ groupId, exercises: [exercise] });
    }
  }
  return runs;
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
      <div className="min-w-0 flex-1 p-3">
        <p className="font-rounded font-semibold text-neutral-800 dark:text-neutral-100">
          {exercise.name}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {exercise.sets.map((set, j) => (
            <span
              key={j}
              className="inline-block w-16 rounded-md bg-white py-0.5 text-center text-xs font-semibold tabular-nums text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
            >
              {formatSet(set)}
            </span>
          ))}
        </div>
      </div>
      <span
        className="flex w-24 shrink-0 items-center justify-center self-stretch text-xs font-semibold text-white"
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
  selectedDate,
  onClose,
}: {
  selectedDate: string | null;
  onClose: () => void;
}) {
  const isClosingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = !!selectedDate;

  const {
    data: workouts,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getWorkouts.useQuery(
    {
      startDate: selectedDate
        ? new Date(`${selectedDate}T00:00:00Z`).toISOString()
        : "",
      endDate: selectedDate
        ? new Date(`${selectedDate}T23:59:59Z`).toISOString()
        : "",
      limit: 10,
    },
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
    <AnimatePresence>
      {isOpen && selectedDate && (
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
                aria-label={`Workouts on ${addOrdinalSuffix(
                  formatDateLong(new Date(`${selectedDate}T12:00:00`)),
                )}`}
                tabIndex={-1}
                className="relative w-full max-w-[27.5rem] focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  layoutId={`day-${selectedDate}`}
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
                            e.sets.reduce((s, set) => s + (set.volume ?? 0), 0),
                          0,
                        );

                        return (
                          <div key={workout.uuid}>
                            <div className="mb-1 text-center">
                              <h3 className="font-rounded text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                                {workout.name}
                              </h3>
                              <p className="text-base text-neutral-500 dark:text-neutral-400">
                                {addOrdinalSuffix(formatDateLong(workout.date))}
                              </p>
                            </div>

                            <div className="mb-4 mt-3 flex justify-center gap-6 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {totalSets}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <SquaresFourIcon
                                    className="h-3 w-3"
                                    weight="bold"
                                  />
                                  Sets
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {formatVolume(totalVolume)}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <BarbellIcon
                                    className="h-3 w-3"
                                    weight="bold"
                                  />
                                  Volume
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {formatDuration(workout.durationSeconds)}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <TimerIcon
                                    className="h-3 w-3"
                                    weight="bold"
                                  />
                                  Duration
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              {partitionSupersets(workout).map((run, i) =>
                                run.groupId !== null &&
                                run.exercises.length >= 2 ? (
                                  <div
                                    key={i}
                                    className="space-y-1.5 rounded-xl border border-dashed border-neutral-300 p-1.5 dark:border-neutral-600"
                                  >
                                    <p className="flex items-center gap-1 px-1.5 pt-0.5 text-[10px] font-semibold tracking-widest text-neutral-400 dark:text-neutral-500">
                                      <LinkSimpleIcon
                                        className="h-3 w-3"
                                        weight="bold"
                                      />
                                      SUPERSET
                                    </p>
                                    {run.exercises.map((exercise) => (
                                      <ExerciseCard
                                        key={exercise.id}
                                        exercise={exercise}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  run.exercises.map((exercise) => (
                                    <ExerciseCard
                                      key={exercise.id}
                                      exercise={exercise}
                                    />
                                  ))
                                ),
                              )}
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
  );
}
