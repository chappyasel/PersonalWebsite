"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
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
  bareClockLabel,
  clockLabel,
  compactRangeLabel,
  dateLabel,
  hourLabel,
  ordinalSuffix,
  sameClock,
  weekdayLabel,
  zoneLabel,
  zonedDate,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";

import styles from "./meet.module.css";

/** Pixels per minute: an hour is 60 pixels, as on Daybreak's schedule. */
const PX = 1;

/** How far a touch moves before it's a swipe or a scroll, not a tap. */
const SLOP = 10;

/** A swipe this far, or a quick flick past half of it, steps the Days. */
const SWIPE = 56;

type Props = {
  /** The Days drawn as columns. */
  days: BookingDay[];
  /** The Days whose hours set the grid's height, so it holds still as a phone steps. */
  boundsDays?: BookingDay[];
  /** A phone's grid: the booker's rail only, tap to pick, swipe to step. */
  compact?: boolean;
  hostZone: string;
  bookerZone: string;
  host: string;
  length: number;
  selection: number | null;
  suggestions: number[];
  onSelect: (start: number) => void;
  onConfirm: () => void;
  /** A swipe's step, later (1) or earlier (-1); none where it can't go. */
  onStep?: (direction: 1 | -1) => void;
  canStep?: { earlier: boolean; later: boolean };
  /** A tap picked a time. */
  onPicked?: () => void;
};

type Touch = {
  id: number;
  x: number;
  y: number;
  at: number;
  swiping: boolean;
};

type Located = { day: BookingDay; ms: number };

/**
 * A week of open time drawn like Daybreak's schedule, which draws its grid
 * the way Notion Calendar does: each Day a column of the host's hours split
 * by hairlines, open stretches washed green, the best slots marked with a
 * green dot, and the hours outside the booking hours dimmed. Press anywhere
 * open to place the meeting there, and drag it; it snaps to the quarter hour
 * and only lands where the whole length fits. The booker's clock runs down
 * the left rail and the host's down the right, so both times sit beside
 * every slot. Arrow keys do the same from the keyboard.
 *
 * On a phone (`compact`) it shows a few Days and the booker's rail alone. A
 * tap picks a time and a touch on the meeting drags it, while a touch
 * anywhere else leaves vertical scrolling to the page, and a sideways swipe
 * slides the Days, as Daybreak's iPhone schedule does.
 */
export function WeekStrip({
  days,
  boundsDays = days,
  compact = false,
  hostZone,
  bookerZone,
  host,
  length,
  selection,
  suggestions,
  onSelect,
  onConfirm,
  onStep,
  canStep = { earlier: false, later: false },
  onPicked,
}: Props) {
  const hintId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const touch = useRef<Touch | null>(null);
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

  // Only the week's booking hours, so the grid stays compact.
  const bounds = axisBounds(boundsDays, hostZone);
  const hours = axisHours(bounds);
  const height = (bounds.end - bounds.start) * PX;
  const top = (ms: number, day: string) =>
    (minuteOnDay(ms, day, hostZone) - bounds.start) * PX;
  const span = length * MINUTE;
  const reference = days[0]?.day ?? zonedDate(Date.now(), hostZone);
  const referenceMoment = momentOnDay(reference, bounds.start, hostZone);
  const twoClocks = !sameClock(referenceMoment, hostZone, bookerZone);
  const hostRail = twoClocks && !compact;

  // The Days slide in from the side they came from when they change.
  const firstDay = days[0]?.day;
  const shownFirst = useRef(firstDay);
  useEffect(() => {
    const before = shownFirst.current;
    shownFirst.current = firstDay;
    if (!before || !firstDay || before === firstDay) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const from = firstDay > before ? 48 : -48;
    for (const element of slidingParts(frameRef.current)) {
      // Older browsers, and jsdom, have no Web Animations: they just swap.
      if (typeof element.animate !== "function") return;
      element.animate(
        [
          { transform: `translateX(${from}px)`, opacity: 0.3 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
  }, [firstDay]);

  // Now, once mounted, so the server and the first render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = now === null ? null : zonedDate(now, hostZone);
  const nowMinute =
    now !== null && today !== null ? minuteOnDay(now, today, hostZone) : null;
  const showNow =
    nowMinute !== null &&
    nowMinute >= bounds.start &&
    nowMinute <= bounds.end &&
    days.some((d) => d.day === today);

  const slideTo = (dx: number, settle: boolean) => {
    for (const element of slidingParts(frameRef.current)) {
      element.style.transition = settle ? "transform 200ms ease-out" : "";
      element.style.transform = dx === 0 ? "" : `translateX(${dx}px)`;
    }
  };

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
    // A touch off the meeting may be a tap, a swipe, or the page scrolling,
    // so it waits to see which.
    if (event.pointerType !== "mouse" && !onSelection) {
      touch.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
        swiping: false,
      };
      return;
    }
    const grab = onSelection ? at.ms - selection : span / 2;
    const start = dragStart(at.day.open, at.ms, grab, length);
    if (start === null) return;
    event.preventDefault();
    if (event.pointerType === "mouse") {
      setPressed(true);
      gridRef.current?.focus({ preventScroll: true });
    }
    onSelect(start);
    drag.current = { grab, columns: within };
    setDragging(true);
    setHover(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (t?.id === event.pointerId) {
      const dx = event.clientX - t.x;
      const dy = event.clientY - t.y;
      if (!t.swiping && Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        t.swiping = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (t.swiping) {
        const open = dx < 0 ? canStep.later : canStep.earlier;
        slideTo(open && onStep ? dx : dx / 4, false);
      }
      return;
    }
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

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (t?.id !== event.pointerId) {
      endDrag();
      return;
    }
    touch.current = null;
    const dx = event.clientX - t.x;
    const dy = event.clientY - t.y;
    if (t.swiping) {
      const direction = dx < 0 ? 1 : -1;
      const quick =
        Math.abs(dx) > SWIPE / 2 &&
        Math.abs(dx) / Math.max(1, event.timeStamp - t.at) > 0.4;
      const far = Math.abs(dx) >= SWIPE || quick;
      const open = direction === 1 ? canStep.later : canStep.earlier;
      slideTo(0, !(far && open));
      if (far && open) onStep?.(direction);
      return;
    }
    if (Math.hypot(dx, dy) > SLOP) return;
    const at = locate(event.clientX, event.clientY, columns());
    if (!at) return;
    const start = dragStart(at.day.open, at.ms, span / 2, length);
    if (start === null) return;
    onSelect(start);
    onPicked?.();
  };

  /** The page took the touch to scroll, or the system took it. */
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (touch.current?.id === event.pointerId) {
      if (touch.current.swiping) slideTo(0, true);
      touch.current = null;
      return;
    }
    endDrag();
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

  const bookerHour = (minute: number) =>
    hourLabel(momentOnDay(reference, minute, hostZone), bookerZone);

  return (
    <div className={cn(styles.grid, "select-none")}>
      <div
        ref={frameRef}
        className="grid"
        style={{
          gridTemplateColumns: [
            "3.25rem",
            ...days.map((d) =>
              d.open.length > 0 ? "minmax(0,1fr)" : "minmax(0,0.5fr)",
            ),
            ...(compact ? [] : [hostRail ? "3.25rem" : "0"]),
          ].join(" "),
          // A swipe slides the Days under the rail; nothing spills sideways.
          ...(compact ? { overflowX: "clip" as const } : {}),
        }}
      >
        {/* Header row */}
        <div
          className={cn(
            styles.secondary,
            styles.rail,
            "flex flex-col items-end justify-end pb-2 pr-2 text-right text-[10.5px] font-semibold leading-tight",
          )}
        >
          <span>{zoneLabel(referenceMoment, bookerZone)}</span>
          <span>{twoClocks ? "You" : `You and ${host}`}</span>
        </div>
        {days.map(({ day, open }) => {
          const bookerDate =
            open.length > 0
              ? zonedDate((open[0]!.start + open.at(-1)!.end) / 2, bookerZone)
              : day;
          return (
            <div key={day} data-slide className="min-w-0 px-2 pb-2">
              <div
                className={cn(styles.secondary, "text-[11px] font-semibold")}
              >
                {weekdayLabel(day)}
              </div>
              <div
                className={cn(
                  "truncate text-[13px] font-semibold tabular-nums",
                  open.length === 0 && styles.secondary,
                )}
              >
                {open.length > 0 ? dateLabel(day) : shortDate(day)}
              </div>
              {bookerDate !== day && (
                <div className={cn(styles.secondary, "truncate text-[11px]")}>
                  {weekdayLabel(bookerDate)} for you
                </div>
              )}
            </div>
          );
        })}
        {!compact && (
          <div
            className={cn(
              styles.secondary,
              "flex min-w-0 flex-col items-start justify-end pb-2 pl-2 text-[10.5px] font-semibold leading-tight",
            )}
          >
            {hostRail && (
              <>
                <span>{zoneLabel(referenceMoment, hostZone)}</span>
                <span className="max-w-full truncate">{host}</span>
              </>
            )}
          </div>
        )}

        {/* Body row: the booker's rail, the Days, the host's rail */}
        <div
          className={cn(styles.rail, "relative")}
          style={{ height }}
          aria-hidden
        >
          {/* The top edge's label would sit under the zone heading. */}
          {hours
            .filter((m) => m > bounds.start)
            .map((minute) => (
              <span
                key={minute}
                className={cn(styles.railLabel, "pr-2 text-right")}
                style={{ top: (minute - bounds.start) * PX }}
              >
                {bookerHour(minute)}
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
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => {
            setPressed(false);
            onKeyDown(event);
          }}
          onBlur={() => setPressed(false)}
          data-pressed={pressed ? "" : undefined}
          data-slide
          className={cn(styles.days, "grid")}
          style={{
            gridColumn: `2 / span ${days.length}`,
            gridTemplateColumns: "subgrid",
            ["--hour" as string]: `${60 * PX}px`,
          }}
        >
          {days.map(({ day, open }) => {
            const weekday = weekdayLabel(day);
            return (
              <div
                key={day}
                data-day={day}
                data-closed={open.length === 0 ? "" : undefined}
                data-weekend={
                  weekday === "Sat" || weekday === "Sun" ? "" : undefined
                }
                className={styles.day}
                style={{ height }}
              >
                {open.length === 0 && (
                  <span
                    className={cn(
                      styles.secondary,
                      "absolute inset-x-0 top-2 text-center text-[10.5px] font-semibold",
                    )}
                  >
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
                  .filter(
                    (start) =>
                      start !== selection &&
                      open.some((s) => s.start <= start && start < s.end),
                  )
                  .map((start) => (
                    <span
                      key={start}
                      className={styles.bestDot}
                      style={{ top: top(start, day) }}
                    />
                  ))}
                {hover?.day === day && hover.start !== selection && (
                  <div
                    className={styles.ghost}
                    style={{ top: top(hover.start, day), height: length * PX }}
                  />
                )}
                {selection !== null &&
                  open.some(
                    (s) => s.start <= selection && selection < s.end,
                  ) && (
                    <div
                      data-selection
                      data-dragging={dragging ? "" : undefined}
                      className={cn(
                        styles.selection,
                        "flex flex-col px-1.5",
                        length >= 45
                          ? "justify-start py-1 leading-tight"
                          : "justify-center leading-none",
                      )}
                      style={{ top: top(selection, day), height: length * PX }}
                    >
                      {/* A column is under 100px wide, so a block under 45
                          minutes holds only the booker's start. The form
                          card beside the grid gives the host's. */}
                      <span className="truncate text-[11.5px] tabular-nums">
                        {length >= 45
                          ? compactRangeLabel(
                              selection,
                              selection + span,
                              bookerZone,
                            )
                          : clockLabel(selection, bookerZone)}
                      </span>
                      {twoClocks && length >= 45 && (
                        <span className="truncate text-[10.5px] tabular-nums opacity-80">
                          {clockLabel(selection, hostZone)}{" "}
                          {zoneLabel(selection, hostZone)}
                        </span>
                      )}
                    </div>
                  )}
                {showNow && day === today && (
                  <div
                    className={styles.nowLine}
                    style={{ top: (nowMinute - bounds.start) * PX }}
                    aria-hidden
                  >
                    <span className={styles.nowPill}>
                      {bareClockLabel(now!, bookerZone)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!compact && (
          <div className="relative" style={{ height }} aria-hidden>
            {hostRail &&
              hours
                .filter((m) => m > bounds.start)
                .map((minute) => (
                  <span
                    key={minute}
                    className={cn(styles.railLabel, "pl-2")}
                    style={{ top: (minute - bounds.start) * PX }}
                  >
                    {hourLabel(
                      momentOnDay(reference, minute, hostZone),
                      hostZone,
                    )}
                  </span>
                ))}
          </div>
        )}
      </div>
      <p id={hintId} className={cn(styles.secondary, "mt-4 text-xs")}>
        {compact
          ? "Tap an open time or drag the meeting. Swipe the days for more."
          : "Press an open time or drag the meeting. With the keyboard, arrow keys move it a quarter hour or a day, Shift moves an hour, and Enter continues."}
      </p>
    </div>
  );
}

/** The pieces that move with a swipe: the Days' headings and columns. */
function slidingParts(frame: HTMLElement | null): HTMLElement[] {
  return [...(frame?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])];
}

/** "7th" for "2026-11-07": a closed Day's narrow column. */
function shortDate(day: string): string {
  const date = Number(day.slice(8));
  return `${date}${ordinalSuffix(date)}`;
}
