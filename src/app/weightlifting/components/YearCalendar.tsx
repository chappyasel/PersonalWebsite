"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "framer-motion";
import { useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { categoryColor } from "../lib/utils";
import { QueryErrorFallback } from "./QueryErrorFallback";
import { WorkoutDetailModal } from "./WorkoutDetailModal";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

  // e.g. "March 5: Chest 4, Triceps 2" — category names are the non-color cue
  const ariaLabel = hasWorkout
    ? `${MONTH_NAMES_FULL[parseInt(dateStr.slice(5, 7)) - 1]} ${day}: ${sorted
        .map(([cat, n]) => `${cat} ${n}`)
        .join(", ")}`
    : undefined;

  return (
    <motion.div
      layoutId={hasWorkout ? `day-${dateStr}` : undefined}
      role={hasWorkout ? "button" : undefined}
      tabIndex={hasWorkout ? 0 : undefined}
      aria-label={ariaLabel}
      className={`flex h-8 flex-col items-center justify-center ${
        !isCurrentMonth ? "opacity-0" : ""
      } ${hasWorkout ? "cursor-pointer rounded-md transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-700 dark:focus-visible:ring-neutral-500" : ""}`}
      onClick={hasWorkout ? () => onDayClick(dateStr) : undefined}
      onKeyDown={
        hasWorkout
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDayClick(dateStr);
              }
            }
          : undefined
      }
      onFocus={handleMouseEnter}
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
  month: number;
  dayMap: Record<string, Record<string, number>>;
  onDayClick: (dateStr: string) => void;
}) {
  const today = new Date();
  const todayStr =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : -1;

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
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

export function YearCalendar() {
  const { data: stats } = api.weightlifting.getStats.useQuery();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const {
    data: calendarData,
    isLoading,
    isError,
    refetch,
  } = api.weightlifting.getCalendarData.useQuery({ year });

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

      {isError ? (
        <QueryErrorFallback
          label="workout calendar"
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
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
