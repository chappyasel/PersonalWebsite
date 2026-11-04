"use client";

import type { BookingDay } from "~/lib/booking/page";
import { startsIn } from "~/lib/booking/slots";
import {
  clockLabel,
  dateLabel,
  sameClock,
  weekdayLabel,
  zonedParts,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";

import styles from "./meet.module.css";

type Props = {
  days: BookingDay[];
  activeDay: string | null;
  hostZone: string;
  bookerZone: string;
  host: string;
  length: number;
  selection: number | null;
  suggestions: number[];
  onDay: (day: string) => void;
  onSelect: (start: number) => void;
};

const PARTS = [
  { name: "Morning", until: 12 },
  { name: "Afternoon", until: 17 },
  { name: "Evening", until: 24 },
];

/**
 * The phone's picker: one Day at a time, its open starts as a list of
 * buttons, grouped by the booker's part of the day. Each shows the
 * booker's time and, when the clocks differ, the host's under it.
 */
export function TimeList({
  days,
  activeDay,
  hostZone,
  bookerZone,
  host,
  length,
  selection,
  suggestions,
  onDay,
  onSelect,
}: Props) {
  const openDays = days.filter((d) => startsIn(d.open, length).length > 0);
  const day = openDays.find((d) => d.day === activeDay) ?? openDays[0];
  if (!day) {
    return (
      <p className={cn(styles.secondary, "py-6 text-sm")}>
        Nothing open this week at this length.
      </p>
    );
  }
  const starts = startsIn(day.open, length);
  const groups = PARTS.map((part, i) => ({
    name: part.name,
    starts: starts.filter((start) => {
      const hour = zonedParts(start, bookerZone).hour;
      return hour < part.until && hour >= (PARTS[i - 1]?.until ?? 0);
    }),
  })).filter((group) => group.starts.length > 0);

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Days" className={styles.dayTrack}>
        {openDays.map((d) => {
          const best = suggestions.some((s) =>
            d.open.some((o) => o.start <= s && s < o.end),
          );
          return (
            <button
              key={d.day}
              type="button"
              aria-pressed={d.day === day.day}
              onClick={() => onDay(d.day)}
              className={styles.daySegment}
            >
              <span
                className={cn(
                  styles.secondary,
                  "block text-[11px] font-semibold",
                )}
              >
                {weekdayLabel(d.day)}
              </span>
              <span className="flex items-center justify-center gap-1 text-[13px] font-semibold tabular-nums">
                {dateLabel(d.day)}
                {best && (
                  <span
                    role="img"
                    aria-label="Has a best time"
                    className={styles.dot}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section key={group.name} aria-label={group.name}>
          <h3 className={cn(styles.secondary, "mb-2 text-xs font-semibold")}>
            {group.name}
          </h3>
          <ul className="grid grid-cols-3 gap-2">
            {group.starts.map((start) => {
              const best = suggestions.includes(start);
              const both = !sameClock(start, hostZone, bookerZone);
              return (
                <li key={start}>
                  <button
                    type="button"
                    aria-pressed={selection === start}
                    aria-label={`${clockLabel(start, bookerZone)} your time${
                      both ? `, ${clockLabel(start, hostZone)} for ${host}` : ""
                    }${best ? ", a best time" : ""}`}
                    onClick={() => onSelect(start)}
                    className={styles.timeButton}
                  >
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      {best && <span aria-hidden className={styles.dot} />}
                      {clockLabel(start, bookerZone)}
                    </span>
                    {both && (
                      <span className={cn(styles.secondary, "text-[11px]")}>
                        {clockLabel(start, hostZone)} {host}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
