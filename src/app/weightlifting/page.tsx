"use client";

import {
  BarbellIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  HashIcon,
  HouseLineIcon,
  SquaresFourIcon,
  TimerIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/trpc/react";

// ── Category colors from WeightliftingApp ────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Abs / Core": "#F44336",
  Back: "#3F51B5",
  Biceps: "#8E24AA",
  Cardio: "#E91E63",
  Chest: "#039BE5",
  Legs: "#DAC400",
  Olympic: "#009688",
  Shoulders: "#EF6C00",
  Triceps: "#4CAF50",
  Other: "#6885AB",
};

function categoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? "#6885AB";
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatVolume(lbs: number) {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M lbs`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K lbs`;
  return `${lbs.toLocaleString()} lbs`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}


// ── Stats Cards ──────────────────────────────────────────────────────

function StatsCards() {
  const { data: stats, isLoading } = api.weightlifting.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const totalHours = Math.round(stats.totalDurationSeconds / 3600);

  const cards: { label: string; value: string; icon: Icon }[] = [
    { label: "Workouts", value: stats.totalWorkouts.toLocaleString(), icon: HashIcon },
    { label: "Total Sets", value: stats.totalSets.toLocaleString(), icon: SquaresFourIcon },
    { label: "Total Volume", value: formatVolume(stats.totalVolume), icon: BarbellIcon },
    { label: "Total Duration", value: `${totalHours.toLocaleString()} hrs`, icon: ClockIcon },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <p className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <card.icon className="h-4 w-4" weight="bold" />
            {card.label}
          </p>
          <p className="mt-1 font-rounded text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Helpers (used by modal) ──────────────────────────────────────────

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

// ── Personal Records ─────────────────────────────────────────────────

function PersonalRecords() {
  const { data: records, isLoading } =
    api.weightlifting.getPersonalRecords.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

  if (!records || records.length === 0) {
    return <p className="text-sm text-neutral-500">No records found.</p>;
  }

  const sorted = [...records].sort((a, b) => b.bestOneRM - a.bestOneRM).slice(0, 20);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            <th className="pb-2 pr-4 font-medium">Exercise</th>
            <th className="pb-2 pr-4 text-right font-medium">Est. 1RM</th>
            <th className="pb-2 text-right font-medium">Best Set</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((record) => (
            <tr
              key={record.exerciseName}
              className="border-b border-neutral-100 dark:border-neutral-700/50"
            >
              <td className="py-2 pr-4 text-neutral-800 dark:text-neutral-100">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(record.category) }}
                  />
                  {record.exerciseName}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                {Math.round(record.bestOneRM)} lbs
              </td>
              <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                {record.reps}x{record.weight}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Year Calendar ───────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  day,
  dateStr,
  categories,
  isToday,
  isCurrentMonth,
  onDayClick,
}: {
  day: number;
  dateStr: string;
  categories: Record<string, number> | undefined;
  isToday: boolean;
  isCurrentMonth: boolean;
  onDayClick: (dateStr: string) => void;
}) {
  const utils = api.useUtils();
  const hasWorkout = categories && Object.keys(categories).length > 0;

  const handleMouseEnter = () => {
    if (!hasWorkout || !dateStr) return;
    void utils.weightlifting.getWorkouts.prefetch({
      startDate: new Date(`${dateStr}T00:00:00Z`).toISOString(),
      endDate: new Date(`${dateStr}T23:59:59Z`).toISOString(),
      limit: 10,
    });
  };
  const sorted = hasWorkout
    ? Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);

  return (
    <motion.div
      layoutId={hasWorkout ? `day-${dateStr}` : undefined}
      className={`flex h-8 flex-col items-center justify-center ${
        !isCurrentMonth ? "opacity-0" : ""
      } ${hasWorkout ? "cursor-pointer rounded-md transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700" : ""}`}
      onClick={hasWorkout ? () => onDayClick(dateStr) : undefined}
      onMouseEnter={handleMouseEnter}
    >
      <span
        className={`text-[10px] tabular-nums leading-tight ${
          hasWorkout
            ? "font-semibold text-neutral-800 dark:text-neutral-100"
            : "text-neutral-400 dark:text-neutral-500"
        } ${isToday ? "rounded-full bg-neutral-800 px-1 text-white dark:bg-neutral-200 dark:text-neutral-900" : ""}`}
      >
        {day}
      </span>
      {hasWorkout && total > 0 ? (
        <div className="mt-0.5 flex h-1.5 w-2/3 overflow-hidden rounded-full">
          {sorted.map(([cat, count]) => (
            <div
              key={cat}
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: categoryColor(cat),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-0.5 h-1.5" />
      )}
    </motion.div>
  );
}

function MonthMiniCalendar({
  year,
  month,
  dayMap,
  onDayClick,
}: {
  year: number;
  month: number; // 0-indexed
  dayMap: Record<string, Record<string, number>>;
  onDayClick: (dateStr: string) => void;
}) {
  const today = new Date();
  const todayStr =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : -1;

  const firstDay = new Date(year, month, 1);
  // Monday=0 offset
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  // Pad to fill last row
  while (cells.length % 7 !== 0) cells.push({ day: 0, inMonth: false });

  return (
    <div>
      <p className="mb-1.5 text-center text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {MONTH_NAMES[month]}
      </p>
      <div className="grid grid-cols-7 gap-x-0.5">
        {DAY_HEADERS.map((d) => (
          <span
            key={d}
            className="text-center text-[9px] text-neutral-400 dark:text-neutral-500"
          >
            {d[0]}
          </span>
        ))}
        {cells.map((cell, i) => {
          const dateStr = cell.inMonth
            ? `${year}-${String(month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`
            : "";
          return (
            <DayCell
              key={i}
              day={cell.day}
              dateStr={dateStr}
              categories={dateStr ? dayMap[dateStr] : undefined}
              isToday={cell.day === todayStr}
              isCurrentMonth={cell.inMonth}
              onDayClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function formatDateLong(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function addOrdinalSuffix(dateStr: string) {
  // Replace the day number with ordinal (e.g. "January 27" → "January 27th")
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

function WorkoutDetailModal({
  selectedDate,
  onClose,
}: {
  selectedDate: string | null;
  onClose: () => void;
}) {
  const isClosingRef = useRef(false);
  const isOpen = !!selectedDate;

  // Fetch workouts for selected date
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

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // ESC to close
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
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm dark:bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            onClick={handleClose}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className="relative w-full max-w-[27.5rem]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Animated placeholder — morphs from day cell */}
                <motion.div
                  layoutId={`day-${selectedDate}`}
                  className="absolute inset-0 rounded-2xl border border-neutral-200 bg-white shadow-[0px_10px_50px_10px_rgba(0,0,0,0.1)] dark:border-neutral-700 dark:bg-neutral-900"
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                />

                {/* Actual content — fades in on top */}
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
                            {/* Header */}
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

                            {/* Stats row */}
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

                            {/* Exercises */}
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

function YearCalendar() {
  const { data: stats } = api.weightlifting.getStats.useQuery();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: calendarData, isLoading } =
    api.weightlifting.getCalendarData.useQuery({ year });

  const minYear = stats?.earliestWorkout
    ? new Date(stats.earliestWorkout).getFullYear()
    : currentYear;

  const dayMap: Record<string, Record<string, number>> = {};
  if (calendarData) {
    for (const entry of calendarData) {
      dayMap[entry.date] = entry.categories;
    }
  }

  return (
    <div>
      {/* Year selector */}
      <div className="mb-4 flex items-center justify-center gap-3">
        <button
          onClick={() => setYear((y) => Math.max(minYear, y - 1))}
          disabled={year <= minYear}
          className="rounded-lg p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <CaretLeftIcon className="h-4 w-4" weight="bold" />
        </button>
        <span className="min-w-[3rem] text-center font-rounded text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          {year}
        </span>
        <button
          onClick={() => setYear((y) => Math.min(currentYear, y + 1))}
          disabled={year >= currentYear}
          className="rounded-lg p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <CaretRightIcon className="h-4 w-4" weight="bold" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, month) => (
            <MonthMiniCalendar
              key={month}
              year={year}
              month={month}
              dayMap={dayMap}
              onDayClick={setSelectedDate}
            />
          ))}
        </div>
      )}

      <WorkoutDetailModal
        selectedDate={selectedDate}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function WeightliftingPage() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href={
            process.env.NODE_ENV === "production"
              ? "https://chappyasel.com"
              : "http://localhost:3000"
          }
          className="group inline-flex items-center gap-2 text-2xl font-semibold text-foreground transition-opacity hover:opacity-80 md:text-4xl"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center md:h-9 md:w-9">
            <AnimatePresence mode="wait" initial={false}>
              {isHovered ? (
                <motion.div
                  key="house-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <HouseLineIcon
                    className="h-7 w-7 md:h-9 md:w-9"
                    weight="bold"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="app-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <Image
                    src="/images/manual/weightlifting-app.png"
                    alt="Weightlifting App"
                    width={36}
                    height={36}
                    className="h-7 w-7 rounded-lg md:h-9 md:w-9"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
          <span className="line-clamp-1 font-rounded">
            Chappy&apos;s Weightlifting
          </span>
        </Link>
      </div>

      {/* Stats */}
      <section>
        <StatsCards />
      </section>

      {/* Year Calendar */}
      <section>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <YearCalendar />
        </div>
      </section>

      {/* Personal Records */}
      <section>
        <h2 className="mb-4 font-rounded text-lg font-medium text-neutral-700 dark:text-neutral-200">
          All-time PRs
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <PersonalRecords />
        </div>
      </section>
    </div>
  );
}
