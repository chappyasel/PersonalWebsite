"use client";

import { SunIcon } from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from "react";

import type { BookingDay } from "~/lib/booking/page";
import {
  MINUTE,
  dragStart,
  nearestStart,
  startsIn,
  stepStart,
} from "~/lib/booking/slots";
import {
  axisBounds,
  axisHours,
  minuteOnDay,
  momentOnDay,
} from "~/lib/booking/strip";
import {
  clockLabel,
  compactRangeLabel,
  dateLabel,
  ordinalSuffix,
  sameClock,
  shortClockLabel,
  weekdayLabel,
  zoneLabel,
  zonedDate,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";

import styles from "./meet.module.css";

/** Pixels per minute: nine open hours stand about 600 pixels tall. */
const PX = 1.1;

type Props = {
  days: BookingDay[];
  hostZone: string;
  bookerZone: string;
  host: string;
  length: number;
  selection: number | null;
  suggestions: number[];
  onSelect: (start: number) => void;
  onConfirm: () => void;
};

type Located = { day: BookingDay; ms: number };

/**
 * A week of open time drawn like Daybreak's schedule: each Day a column of
 * the host's hours, open stretches in moss, the best slots glinting in
 * ochre. Press anywhere open to place the meeting there, and drag it; it
 * snaps to the quarter hour and only lands where the whole length fits.
 * The booker's clock runs down the left rail and the host's down the right,
 * so both times sit beside every slot. Arrow keys do the same from the
 * keyboard.
 */
export function WeekStrip({
  days,
  hostZone,
  bookerZone,
  host,
  length,
  selection,
  suggestions,
  onSelect,
  onConfirm,
}: Props) {
  const hintId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    grab: number;
    columns: { day: BookingDay; rect: DOMRect }[];
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  // The strip takes focus when pressed, so its keys work next; the ring is
  // for keyboard focus only.
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState<{ day: string; start: number } | null>(
    null,
  );

  const bounds = axisBounds(days, hostZone);
  const hours = axisHours(bounds);
  const height = (bounds.end - bounds.start) * PX;
  const top = (ms: number, day: string) =>
    (minuteOnDay(ms, day, hostZone) - bounds.start) * PX;
  const span = length * MINUTE;
  const reference = days[0]?.day ?? zonedDate(Date.now(), hostZone);
  const referenceMoment = momentOnDay(reference, bounds.start, hostZone);
  const twoClocks = !sameClock(referenceMoment, hostZone, bookerZone);

  const columns = () =>
    [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-day]") ?? [])]
      .map((element) => ({
        day: days.find((d) => d.day === element.dataset.day)!,
        rect: element.getBoundingClientRect(),
      }))
      .filter((column) => column.day);

  const locate = (
    clientX: number,
    clientY: number,
    within: { day: BookingDay; rect: DOMRect }[],
  ): Located | null => {
    if (within.length === 0) return null;
    const hit =
      within.find((c) => clientX >= c.rect.left && clientX < c.rect.right) ??
      within.reduce((best, c) =>
        Math.abs(c.rect.left + c.rect.width / 2 - clientX) <
        Math.abs(best.rect.left + best.rect.width / 2 - clientX)
          ? c
          : best,
      );
    const minute = bounds.start + (clientY - hit.rect.top) / PX;
    return { day: hit.day, ms: momentOnDay(hit.day.day, minute, hostZone) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const within = columns();
    const at = locate(event.clientX, event.clientY, within);
    if (!at) return;
    const onSelection =
      selection !== null &&
      (event.target as HTMLElement).closest("[data-selection]") !== null;
    const grab = onSelection ? at.ms - selection : span / 2;
    const start = dragStart(at.day.open, at.ms, grab, length);
    if (start === null) return;
    event.preventDefault();
    setPressed(true);
    gridRef.current?.focus({ preventScroll: true });
    onSelect(start);
    drag.current = { grab, columns: within };
    setDragging(true);
    setHover(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      const at = locate(event.clientX, event.clientY, drag.current.columns);
      if (!at) return;
      const start = dragStart(at.day.open, at.ms, drag.current.grab, length);
      if (start !== null && start !== selection) onSelect(start);
      return;
    }
    if (event.pointerType !== "mouse") return;
    const at = locate(event.clientX, event.clientY, columns());
    const inOpen = at?.day.open.some((s) => s.start <= at.ms && at.ms < s.end);
    if (!at || !inOpen) {
      if (hover) setHover(null);
      return;
    }
    const start = dragStart(at.day.open, at.ms, span / 2, length);
    if (start === null) return;
    if (hover?.start !== start) setHover({ day: at.day.day, start });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ];
    if (event.key === "Enter" && selection !== null) {
      event.preventDefault();
      onConfirm();
      return;
    }
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = days.findIndex((d) =>
      d.open.some(
        (s) => selection !== null && s.start <= selection && selection < s.end,
      ),
    );
    if (selection === null || index < 0) {
      const first =
        suggestions[0] ??
        days
          .map((d) => startsIn(d.open, length)[0])
          .find((s) => s !== undefined);
      if (first !== undefined) onSelect(first);
      return;
    }
    const day = days[index]!;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      next = stepStart(day.open, selection, length, direction);
      // Shift moves an hour at a time.
      for (let i = 1; event.shiftKey && next !== null && i < 4; i++) {
        next = stepStart(day.open, next, length, direction) ?? next;
      }
    } else if (event.key === "Home" || event.key === "End") {
      const starts = startsIn(day.open, length);
      next = (event.key === "Home" ? starts[0] : starts.at(-1)) ?? null;
    } else {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const minute = minuteOnDay(selection, day.day, hostZone);
      for (
        let i = index + direction;
        i >= 0 && i < days.length;
        i += direction
      ) {
        const other = days[i]!;
        next = nearestStart(
          other.open,
          momentOnDay(other.day, minute, hostZone),
          length,
        );
        if (next !== null) break;
      }
    }
    if (next !== null) onSelect(next);
  };

  const bookerMinute = (minute: number) =>
    shortClockLabel(momentOnDay(reference, minute, hostZone), bookerZone);

  return (
    <div className={cn(styles.figure, "select-none")}>
      <div
        className="grid gap-x-1.5"
        style={{
          gridTemplateColumns: [
            "3.75rem",
            ...days.map((d) =>
              d.open.length > 0 ? "minmax(0,1fr)" : "minmax(0,0.45fr)",
            ),
            twoClocks ? "3.75rem" : "0",
          ].join(" "),
        }}
      >
        {/* Header row */}
        <div className="flex flex-col items-end justify-end pb-2 pr-2 text-right text-[11px] font-medium leading-tight text-muted-foreground">
          <span className="text-foreground">
            {zoneLabel(referenceMoment, bookerZone)}
          </span>
          <span>{twoClocks ? "You" : `You and ${host}`}</span>
        </div>
        {days.map(({ day, open }) => {
          const bookerDate =
            open.length > 0
              ? zonedDate((open[0]!.start + open.at(-1)!.end) / 2, bookerZone)
              : day;
          return (
            <div key={day} className="min-w-0 pb-2 font-sans">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {weekdayLabel(day)}
              </div>
              <div
                className={cn(
                  "truncate text-sm font-medium",
                  open.length === 0 && "text-muted-foreground",
                )}
              >
                {open.length > 0 ? dateLabel(day) : shortDate(day)}
              </div>
              {bookerDate !== day && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {weekdayLabel(bookerDate)} for you
                </div>
              )}
            </div>
          );
        })}
        <div className="flex min-w-0 flex-col items-start justify-end pb-2 pl-2 text-[11px] font-medium leading-tight text-muted-foreground">
          {twoClocks && (
            <>
              <span className="text-foreground">
                {zoneLabel(referenceMoment, hostZone)}
              </span>
              <span className="max-w-full truncate">{host}</span>
            </>
          )}
        </div>

        {/* Body row: the booker's rail, the Days, the host's rail */}
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((minute) => (
            <span
              key={minute}
              className={cn(
                styles.railLabel,
                "pr-2 text-right text-[11px] font-medium text-foreground/80",
              )}
              style={{ top: (minute - bounds.start) * PX }}
            >
              {bookerMinute(minute)}
            </span>
          ))}
        </div>

        <div
          ref={gridRef}
          role="group"
          tabIndex={0}
          aria-label="Open times this week"
          aria-describedby={hintId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => {
            setPressed(false);
            onKeyDown(event);
          }}
          onBlur={() => setPressed(false)}
          data-pressed={pressed ? "" : undefined}
          className="grid rounded-[0.7rem] outline-none ring-ring ring-offset-4 ring-offset-background [&:focus-visible:not([data-pressed])]:ring-2"
          style={{
            gridColumn: `2 / span ${days.length}`,
            gridTemplateColumns: "subgrid",
          }}
        >
          {days.map(({ day, open }) => (
            <div
              key={day}
              data-day={day}
              data-closed={open.length === 0 ? "" : undefined}
              className={styles.dayBody}
              style={{ height, ["--hour" as string]: `${60 * PX}px` }}
            >
              {open.length === 0 && (
                <span className="absolute inset-x-0 top-3 text-center text-[11px] text-muted-foreground">
                  Closed
                </span>
              )}
              {open.map((stretch) => (
                <div
                  key={stretch.start}
                  className={styles.open}
                  style={{
                    top: top(stretch.start, day),
                    height: ((stretch.end - stretch.start) / MINUTE) * PX,
                  }}
                />
              ))}
              {suggestions
                .filter((start) =>
                  open.some((s) => s.start <= start && start < s.end),
                )
                .map((start) => (
                  <div
                    key={start}
                    className={cn(
                      styles.best,
                      "flex items-start justify-end p-1",
                    )}
                    style={{ top: top(start, day), height: length * PX }}
                  >
                    {selection !== start && (
                      <SunIcon size={12} weight="fill" aria-hidden />
                    )}
                  </div>
                ))}
              {hover?.day === day && hover.start !== selection && (
                <div
                  className={styles.ghost}
                  style={{ top: top(hover.start, day), height: length * PX }}
                />
              )}
              {selection !== null &&
                open.some((s) => s.start <= selection && selection < s.end) && (
                  <div
                    data-selection
                    data-dragging={dragging ? "" : undefined}
                    className={cn(
                      styles.selection,
                      "flex flex-col overflow-hidden px-2 font-sans",
                      length >= 45
                        ? "justify-start py-1 leading-tight"
                        : "justify-center leading-none",
                    )}
                    style={{ top: top(selection, day), height: length * PX }}
                  >
                    {/* A column is under 100px wide, so a block under 45
                        minutes holds only the booker's start. The form card
                        beside the strip gives the host's. */}
                    <span className="truncate text-xs font-semibold tabular-nums">
                      {length >= 45
                        ? compactRangeLabel(
                            selection,
                            selection + span,
                            bookerZone,
                          )
                        : clockLabel(selection, bookerZone)}
                    </span>
                    {twoClocks && length >= 45 && (
                      <span className="truncate text-[11px] tabular-nums opacity-75">
                        {clockLabel(selection, hostZone)}{" "}
                        {zoneLabel(selection, hostZone)}
                      </span>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>

        <div className="relative" style={{ height }} aria-hidden>
          {twoClocks &&
            hours.map((minute) => (
              <span
                key={minute}
                className={cn(
                  styles.railLabel,
                  "pl-2 text-[11px] text-muted-foreground",
                )}
                style={{ top: (minute - bounds.start) * PX }}
              >
                {shortClockLabel(
                  momentOnDay(reference, minute, hostZone),
                  hostZone,
                )}
              </span>
            ))}
        </div>
      </div>
      <p id={hintId} className="mt-5 text-xs text-muted-foreground">
        Press an open time or drag the meeting. With the keyboard, arrow keys
        move it a quarter hour or a day, Shift moves an hour, and Enter
        continues.
      </p>
    </div>
  );
}

/** "7th" for "2026-11-07": a closed Day's narrow column. */
function shortDate(day: string): string {
  const date = Number(day.slice(8));
  return `${date}${ordinalSuffix(date)}`;
}
