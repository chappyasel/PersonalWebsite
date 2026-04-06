"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Map hours to an opacity level for the heatmap */
function hoursToOpacity(hours: number): number {
  if (hours === 0) return 0;
  if (hours < 0.5) return 0.2;
  if (hours < 1) return 0.35;
  if (hours < 2) return 0.5;
  if (hours < 4) return 0.7;
  return 0.9;
}

function DayCell({
  day,
  dateStr,
  hours,
  videoCount,
  isToday,
  isCurrentMonth,
}: {
  day: number;
  dateStr: string;
  hours: number;
  videoCount: number;
  isToday: boolean;
  isCurrentMonth: boolean;
}) {
  const opacity = hoursToOpacity(hours);

  return (
    <div
      className={`flex h-8 flex-col items-center justify-center ${
        !isCurrentMonth ? "opacity-0" : ""
      }`}
      title={
        hours > 0
          ? `${dateStr}: ${hours.toFixed(1)}h (${videoCount} videos)`
          : dateStr
      }
    >
      <span
        className={`text-[10px] tabular-nums leading-tight ${
          hours > 0
            ? "font-semibold text-neutral-800 dark:text-neutral-100"
            : "text-neutral-400 dark:text-neutral-500"
        } ${isToday ? "rounded-full bg-neutral-800 px-1 text-white dark:bg-neutral-200 dark:text-neutral-900" : ""}`}
      >
        {day}
      </span>
      {hours > 0 ? (
        <div
          className="mt-0.5 h-1.5 w-2/3 rounded-full"
          style={{
            backgroundColor: `rgba(239, 68, 68, ${opacity})`,
          }}
        />
      ) : (
        <div className="mt-0.5 h-1.5" />
      )}
    </div>
  );
}

function MonthMiniCalendar({
  year,
  month,
  dayMap,
}: {
  year: number;
  month: number;
  dayMap: Record<string, { totalHours: number; videoCount: number }>;
}) {
  const today = new Date();
  const todayDay =
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
          const entry = dateStr ? dayMap[dateStr] : undefined;
          return (
            <DayCell
              key={i}
              day={cell.day}
              dateStr={dateStr}
              hours={entry?.totalHours ?? 0}
              videoCount={entry?.videoCount ?? 0}
              isToday={cell.day === todayDay}
              isCurrentMonth={cell.inMonth}
            />
          );
        })}
      </div>
    </div>
  );
}

export function YearCalendar() {
  const { data: stats } = api.youtube.getStats.useQuery();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: calendarData, isLoading } =
    api.youtube.getCalendarData.useQuery({ year });

  const minYear = stats?.earliestWatch
    ? new Date(stats.earliestWatch).getFullYear()
    : currentYear;

  const dayMap: Record<
    string,
    { totalHours: number; videoCount: number }
  > = {};
  if (calendarData) {
    for (const entry of calendarData) {
      dayMap[entry.date] = {
        totalHours: entry.totalHours,
        videoCount: entry.videoCount,
      };
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
