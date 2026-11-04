"use client";

import { SunIcon } from "@phosphor-icons/react";

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

import { Button } from "~/components/ui/button";

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
      <p className="py-6 text-sm text-muted-foreground">
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
      <div
        role="group"
        aria-label="Days"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {openDays.map((d) => {
          const best = suggestions.some((s) =>
            d.open.some((o) => o.start <= s && s < o.end),
          );
          return (
            <Button
              key={d.day}
              type="button"
              variant={d.day === day.day ? "default" : "outline"}
              aria-pressed={d.day === day.day}
              onClick={() => onDay(d.day)}
              className="h-auto shrink-0 flex-col gap-0 px-3 py-2"
            >
              <span className="text-[11px] uppercase tracking-[0.14em] opacity-75">
                {weekdayLabel(d.day)}
              </span>
              <span className="flex items-center gap-1">
                {dateLabel(d.day)}
                {best && (
                  <SunIcon
                    size={12}
                    weight="fill"
                    className="text-[hsl(var(--dl-am))]"
                    aria-label="Has a best time"
                  />
                )}
              </span>
            </Button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section key={group.name} aria-label={group.name}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {group.name}
          </h3>
          <ul className="grid grid-cols-3 gap-2">
            {group.starts.map((start) => {
              const best = suggestions.includes(start);
              const both = !sameClock(start, hostZone, bookerZone);
              return (
                <li key={start}>
                  <Button
                    type="button"
                    variant={selection === start ? "default" : "outline"}
                    aria-pressed={selection === start}
                    aria-label={`${clockLabel(start, bookerZone)} your time${
                      both ? `, ${clockLabel(start, hostZone)} for ${host}` : ""
                    }${best ? ", a best time" : ""}`}
                    data-best={best && selection !== start ? "" : undefined}
                    onClick={() => onSelect(start)}
                    className={cn(
                      styles.timeChip,
                      "h-auto w-full flex-col gap-0 px-1 py-2 tabular-nums",
                    )}
                  >
                    <span className="flex items-center gap-1 text-sm">
                      {best && <SunIcon size={11} weight="fill" aria-hidden />}
                      {clockLabel(start, bookerZone)}
                    </span>
                    {both && (
                      <span className="text-[11px] opacity-70">
                        {clockLabel(start, hostZone)} {host}
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
