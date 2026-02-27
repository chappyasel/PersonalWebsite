"use client";

import {
  BarbellIcon,
  SquaresFourIcon,
  TimerIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { Spinner } from "~/components/ui/spinner";
import { api } from "~/trpc/react";
import { categoryColor, formatDuration, formatVolume } from "../lib/utils";

function formatSet(set: {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distance: number | null;
  custom: string | null;
}) {
  if (set.reps != null && set.weight != null) return `${set.reps}x${set.weight}`;
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
  const isOpen = !!selectedDate;

  const { data: workouts, isLoading } =
    api.weightlifting.getWorkouts.useQuery(
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
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
                className="relative w-full max-w-[27.5rem]"
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  layoutId={`day-${selectedDate}`}
                  className="absolute inset-0 rounded-2xl border border-neutral-200 bg-white shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:border-neutral-700 dark:bg-neutral-900"
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                />

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

                        return (
                          <div key={workout.uuid}>
                            <div className="mb-1 text-center">
                              <h3 className="font-rounded text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                                {workout.name}
                              </h3>
                              <p className="text-base text-neutral-500 dark:text-neutral-400">
                                {addOrdinalSuffix(
                                  formatDateLong(workout.date),
                                )}
                              </p>
                            </div>

                            <div className="mb-4 mt-3 flex justify-center gap-6 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {totalSets}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <SquaresFourIcon className="h-3 w-3" weight="bold" />
                                  Sets
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {formatVolume(totalVolume)}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <BarbellIcon className="h-3 w-3" weight="bold" />
                                  Volume
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="font-rounded text-xl font-bold text-neutral-800 dark:text-neutral-100">
                                  {formatDuration(workout.durationSeconds)}
                                </p>
                                <p className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  <TimerIcon className="h-3 w-3" weight="bold" />
                                  Duration
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              {workout.exercises.map((exercise, i) => (
                                <div
                                  key={i}
                                  className="flex items-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800"
                                >
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
                                      backgroundColor: categoryColor(
                                        exercise.category,
                                      ),
                                    }}
                                  >
                                    {exercise.category}
                                  </span>
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
  );
}
