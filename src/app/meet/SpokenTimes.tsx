"use client";

import type { BookingDay } from "~/lib/booking/page";
import { startsIn } from "~/lib/booking/slots";
import {
  clockLabel,
  dateLabel,
  sameClock,
  weekdayLabel,
} from "~/lib/booking/zones";

type Props = {
  days: BookingDay[];
  hostZone: string;
  bookerZone: string;
  host: string;
  length: number;
  selection: number | null;
  suggestions: number[];
  onSelect: (start: number) => void;
};

/**
 * The phone grid's open starts as buttons only screen readers reach, since
 * VoiceOver can't drag the meeting or send the grid's arrow keys. One list
 * per visible Day; a button picks its time as a tap on the grid does.
 */
export function SpokenTimes({
  days,
  hostZone,
  bookerZone,
  host,
  length,
  selection,
  suggestions,
  onSelect,
}: Props) {
  const open = days
    .map((day) => ({ day: day.day, starts: startsIn(day.open, length) }))
    .filter((day) => day.starts.length > 0);
  return (
    <div className="sr-only">
      {open.length === 0 && <p>Nothing open on these days at this length.</p>}
      {open.map(({ day, starts }) => (
        <section
          key={day}
          aria-label={`${weekdayLabel(day)}, ${dateLabel(day)}`}
        >
          <h3>
            {weekdayLabel(day)}, {dateLabel(day)}
          </h3>
          <ul>
            {starts.map((start) => (
              <li key={start}>
                <button
                  type="button"
                  aria-pressed={selection === start}
                  onClick={() => onSelect(start)}
                >
                  {spokenLabel(start, hostZone, bookerZone, host, suggestions)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "4:00 PM your time, 1:00 PM for Chappy, best", as the old buttons read. */
function spokenLabel(
  start: number,
  hostZone: string,
  bookerZone: string,
  host: string,
  suggestions: number[],
): string {
  const both = !sameClock(start, hostZone, bookerZone);
  return `${clockLabel(start, bookerZone)} your time${
    both ? `, ${clockLabel(start, hostZone)} for ${host}` : ""
  }${suggestions.includes(start) ? ", best" : ""}`;
}
