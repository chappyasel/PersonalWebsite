"use client";

import { StarIcon } from "@phosphor-icons/react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { type BookingDay, addDays } from "~/lib/booking/page";
import {
  MINUTE,
  bookableSpans,
  dragStart,
  gridFor,
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
  dateLabel,
  dayLabel,
  hourLabel,
  sameClock,
  shortClock,
  shortRange,
  weekdayLabel,
  zoneLabel,
  zonedDate,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";

import { SwapText } from "~/components/ui/rolling-text";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { DateText } from "./DateText";
import styles from "./meet.module.css";

/** Pixels per minute: an hour is 60 pixels, as on Daybreak's schedule. */
const PX = 1;

/**
 * Pixels between the panel's edge and its first and last hour, and between
 * a Day's edge and the blocks in it: meet.module.css's --inset.
 */
const INSET = 4;

/** Pixels a block keeps off the hour line at its top and bottom. */
const GAP = 1;

/** How far a touch moves before it's a swipe or a scroll, not a tap. */
const SLOP = 10;

/** A swipe this far, or a quick flick past half of it, steps the Days. */
const SWIPE = 56;
/** Between a phone's panel of Days and the next one a swipe brings in. */
const PAGE_GAP = 8;
/** A swipe let go of springing back, or gliding on to the next Days. */
const SETTLE = "transform 200ms ease-out";
const GLIDE_MS = 260;
const GLIDE = `transform ${GLIDE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;

/** A step's arrival: how far each Day's contents travel, and how long each
 * column waits on the one before it. */
const STEP_SHIFT = 28;
/** The rail's now pill's height, and the hour labels within it of now
 * that it covers. Daybreak's ScheduleNowPill. */
const NOW_PILL = 14;
/** The zone heading's two lines, at the rail's top. */
const ZONE_HEADING = 24;
const STEP_STAGGER = 22;
/** The meeting's slide, `--slide` in meet.module.css: a slight overshoot. */
const SPRINGY = "cubic-bezier(0.3, 1.25, 0.5, 1)";

type Props = {
  /** The Days drawn as columns. */
  days: BookingDay[];
  /** Days still being read, drawn empty with a small spinner. */
  pending?: ReadonlySet<string>;
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
  /** The Days a swipe steps to, drawn beside these so they come into view
   * under the finger. */
  peek?: { earlier?: BookingDay[]; later?: BookingDay[] };
  /** A tap picked a time. */
  onPicked?: () => void;
  /** The day nav, centred over the Days. */
  nav?: ReactNode;
  /**
   * Left or right from the first or last Day shown, with `minute` the
   * host's clock the meeting starts at.
   */
  onPastEdge?: (direction: 1 | -1, minute: number) => void;
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
 * by hairlines, open stretches washed blue, the best slots marked with a
 * blue star, and the hours outside the booking hours dimmed. Press anywhere
 * open to place the meeting there, and drag it; it snaps to the length's
 * starts (the half hour, or the quarter hour for 15 minutes) and only lands
 * where the whole length fits. Only the time a start can use is drawn
 * open. The booker's clock runs down the left rail and the host's down the
 * right, so both times sit beside every slot. Arrow keys do the same from
 * the keyboard. Each Day is headed by its name, or Today or Tomorrow, over
 * its date.
 *
 * On a phone (`compact`) it shows a few Days and the booker's rail alone. A
 * tap picks a time and a touch on the meeting drags it, while a touch
 * anywhere else leaves vertical scrolling to the page, and a sideways swipe
 * slides the Days, as Daybreak's iPhone schedule does.
 */
export function WeekStrip({
  days,
  pending,
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
  onPastEdge,
  nav,
  peek,
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
  // A swipe let go far enough glides on to the Days beside and then steps,
  // already in place, so they skip the step's arrival.
  const gliding = useRef(false);
  const glided = useRef(false);
  // The strip takes focus when pressed, so its keys work next; the ring is
  // for keyboard focus only.
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState<{ day: string; start: number } | null>(
    null,
  );

  // Only the week's booking hours, so the grid stays compact.
  const bounds = axisBounds(boundsDays, hostZone);
  const hours = axisHours(bounds);
  const height = (bounds.end - bounds.start) * PX + 2 * INSET;
  const y = (minute: number) => (minute - bounds.start) * PX + INSET;
  const top = (ms: number, day: string) => y(minuteOnDay(ms, day, hostZone));
  const span = length * MINUTE;
  const reference = days[0]?.day ?? zonedDate(Date.now(), hostZone);
  const referenceMoment = momentOnDay(reference, bounds.start, hostZone);
  const twoClocks = !sameClock(referenceMoment, hostZone, bookerZone);
  const hostRail = twoClocks && !compact;

  // When the Days step, the panel and its lines hold still and each Day's
  // contents arrive from the side they came from, one column after the
  // next, so the change reads as a page turning rather than a cut.
  const firstDay = days[0]?.day;
  const shownFirst = useRef(firstDay);
  useLayoutEffect(() => {
    if (!gliding.current) return;
    gliding.current = false;
    glided.current = true;
    slideTo(0);
    // Only the step after a glide lands this way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay]);
  useEffect(() => {
    const before = shownFirst.current;
    shownFirst.current = firstDay;
    if (glided.current) {
      glided.current = false;
      return;
    }
    if (!before || !firstDay || before === firstDay) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const frame = frameRef.current;
    // Older browsers, and jsdom, have no Web Animations: they just swap.
    if (!frame || typeof frame.animate !== "function") return;
    const later = firstDay > before;
    const count = days.length;
    const arrive = (element: Element, index: number) => {
      const delay = STEP_STAGGER * (later ? index : count - 1 - index);
      element.animate(
        [
          { transform: `translateX(${later ? STEP_SHIFT : -STEP_SHIFT}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 380, delay, easing: SPRINGY, fill: "backwards" },
      );
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        delay,
        easing: "ease-out",
        fill: "backwards",
      });
    };
    frame
      .querySelectorAll("[data-heading]")
      .forEach((heading, index) => arrive(heading, index));
    frame.querySelectorAll("[data-day]").forEach((day, index) => {
      for (const part of day.children) arrive(part, index);
    });
    const selected = frame.querySelector<HTMLElement>("[data-selection]");
    if (selected) arrive(selected, Number(selected.dataset.column ?? 0));
    // Only a step plays this; the Days' own changes swap in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Today and tomorrow by name, on the booker's calendar, once mounted.
  const bookerToday = now === null ? null : zonedDate(now, bookerZone);
  const dayName = (day: string) =>
    day === bookerToday
      ? "Today"
      : bookerToday && day === addDays(bookerToday, 1)
        ? "Tomorrow"
        : weekdayLabel(day);
  const nowInHours =
    nowMinute !== null && nowMinute >= bounds.start && nowMinute <= bounds.end;
  // The rail's pill stays mounted once now is known, so it pops in and out
  // as now enters or leaves the hours, at the end it left by, and the
  // labels it covers pop away as it reaches them.
  const pill =
    nowMinute === null
      ? null
      : Math.min(bounds.end, Math.max(bounds.start, nowMinute));
  const covered = (minute: number) =>
    nowInHours && Math.abs(y(minute) - y(nowMinute)) < NOW_PILL;

  function slideTo(dx: number, transition = "") {
    for (const element of slidingParts(frameRef.current)) {
      element.style.transition = transition;
      element.style.transform = dx === 0 ? "" : `translateX(${dx}px)`;
    }
  }

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
    const minute = bounds.start + (clientY - hit.rect.top - INSET) / PX;
    return { day: hit.day, ms: momentOnDay(hit.day.day, minute, hostZone) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gliding.current) return;
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
        slideTo(open && onStep ? dx : dx / 4);
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
    const inOpen =
      at &&
      bookableSpans(at.day.open, length).some(
        (s) => s.start <= at.ms && at.ms < s.end,
      );
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
      if (!(far && open && onStep)) {
        slideTo(0, SETTLE);
        return;
      }
      const page = (gridRef.current?.offsetWidth ?? 0) + PAGE_GAP;
      gliding.current = true;
      slideTo(-direction * page, GLIDE);
      window.setTimeout(() => {
        onStep(direction);
        // Should the Days not step after all, come back.
        window.setTimeout(() => {
          if (!gliding.current) return;
          gliding.current = false;
          slideTo(0, SETTLE);
        }, 300);
      }, GLIDE_MS);
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
      if (touch.current.swiping) slideTo(0, SETTLE);
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
      const perHour = (60 * MINUTE) / gridFor(length);
      for (let i = 1; event.shiftKey && next !== null && i < perHour; i++) {
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
      if (next === null) {
        onPastEdge?.(direction, minute);
        return;
      }
    }
    if (next !== null) onSelect(next);
  };

  // The Day a block is on, and its place across the Days: --inset in from
  // the column's edges, past the hairline between Days.
  const dayOf = (ms: number | null) =>
    ms === null
      ? -1
      : days.findIndex((d) => d.open.some((o) => o.start <= ms && ms < o.end));
  const selectionIndex = dayOf(selection);
  const selectionDay = days[selectionIndex];
  const blockRange =
    selection === null
      ? null
      : shortRange(selection, selection + span, bookerZone);
  const hoverIndex = hover ? days.findIndex((d) => d.day === hover.day) : -1;
  const hoverDay = days[hoverIndex];
  const column = (index: number) => {
    const edge = index > 0 ? 1 : 0;
    return {
      left: `calc(${index} * 100% / ${days.length} + ${INSET + edge}px)`,
      width: `calc(100% / ${days.length} - ${2 * INSET + edge}px)`,
    };
  };

  const columnsTemplate = [
    // A phone has no host rail on the right, so its left one is narrow
    // and the grid reaches into the page's gutter to sit near centre.
    compact ? "2.5rem" : "3.25rem",
    ...days.map(() => "minmax(0,1fr)"),
    ...(compact ? [] : [hostRail ? "3.25rem" : "0"]),
  ].join(" ");

  // A Day's heading and its column, for the Days shown and, on a phone,
  // the Days a swipe brings in beside them (`ghost`).
  const heading = ({ day, open }: BookingDay, index: number, ghost = false) => {
    const bookerDate =
      open.length > 0
        ? zonedDate((open[0]!.start + open.at(-1)!.end) / 2, bookerZone)
        : day;
    return (
      <div
        key={day}
        data-heading={ghost ? undefined : ""}
        className={cn(
          "flex min-w-0 flex-col justify-end pb-2",
          compact ? "px-1.5" : "px-2",
        )}
        style={{ ["--col" as string]: index }}
      >
        <div
          className={cn(
            "text-[13px] tabular-nums leading-tight transition-opacity duration-100",
            bookableSpans(open, length).length === 0 &&
              !pending?.has(day) &&
              "opacity-60",
          )}
        >
          <div className="truncate font-semibold">
            <SwapText text={dayName(day)} />
          </div>
          <div className={cn(styles.secondary, "truncate font-medium")}>
            <DateText text={dateLabel(day)} />
          </div>
        </div>
        {bookerDate !== day && (
          <div className={cn(styles.secondary, "truncate text-[11px]")}>
            {weekdayLabel(bookerDate)} for you
          </div>
        )}
      </div>
    );
  };
  const dayColumn = (
    { day, open }: BookingDay,
    index: number,
    ghost = false,
  ) => {
    const weekday = weekdayLabel(day);
    const drawn = bookableSpans(open, length);
    return (
      <div
        key={day}
        data-day={ghost ? undefined : day}
        data-closed={drawn.length === 0 ? "" : undefined}
        data-weekend={weekday === "Sat" || weekday === "Sun" ? "" : undefined}
        className={styles.day}
        style={{ height, ["--col" as string]: index }}
      >
        {pending?.has(day) ? (
          <span aria-hidden className={styles.dayLoading} />
        ) : (
          drawn.length === 0 && (
            <span
              className={cn(
                styles.closedNote,
                "absolute inset-x-1 top-2 text-center text-[10.5px] font-medium leading-tight",
              )}
            >
              No open times
            </span>
          )
        )}
        {drawn.map((stretch) => (
          <div
            key={stretch.start}
            className={styles.open}
            style={{
              top: top(stretch.start, day) + GAP,
              height: ((stretch.end - stretch.start) / MINUTE) * PX - 2 * GAP,
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
            <BestDot key={start} top={top(start, day)} />
          ))}
        {nowInHours && day === today && (
          <div
            className={styles.nowLine}
            style={{ top: y(nowMinute) }}
            aria-hidden
          />
        )}
      </div>
    );
  };
  // The Days a swipe steps to, just past each edge of the Days shown,
  // riding with them in the row that slides: their headings, and their
  // panel of their own.
  const pages = compact
    ? ([
        [peek?.earlier, -1],
        [peek?.later, 1],
      ] as const)
    : [];
  const besideAt = (side: 1 | -1) => ({
    left:
      side === 1 ? `calc(100% + ${PAGE_GAP}px)` : `calc(-100% - ${PAGE_GAP}px)`,
    width: "100%",
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  });
  const besideHeadings = pages.map(
    ([page, side]) =>
      page &&
      page.length > 0 && (
        <div
          key={side}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 grid"
          style={besideAt(side)}
        >
          {page.map((d, index) => heading(d, index, true))}
        </div>
      ),
  );
  const besideDays = pages.map(
    ([page, side]) =>
      page &&
      page.length > 0 && (
        <div
          key={side}
          aria-hidden
          className={cn(styles.days, "pointer-events-none grid")}
          // Inline, since the panel's own class places it relative.
          style={{
            ...besideAt(side),
            position: "absolute",
            top: 0,
            ["--hour" as string]: `${60 * PX}px`,
          }}
        >
          {page.map((d, index) => dayColumn(d, index, true))}
        </div>
      ),
  );
  const row = {
    gridColumn: `2 / span ${days.length}`,
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  };

  const bookerHour = (minute: number) =>
    hourLabel(momentOnDay(reference, minute, hostZone), bookerZone);

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className={cn(styles.grid, "select-none", compact && "-ml-3")}>
        {nav && (
          <div
            className="grid"
            style={{ gridTemplateColumns: columnsTemplate }}
          >
            <div
              className="flex justify-center pb-3"
              style={{ gridColumn: `2 / span ${days.length}` }}
            >
              {nav}
            </div>
          </div>
        )}
        <div
          ref={frameRef}
          className="grid"
          style={{
            gridTemplateColumns: columnsTemplate,
            // A swipe slides the Days under the rail; nothing spills sideways.
            ...(compact ? { overflowX: "clip" as const } : {}),
          }}
        >
          {/* Header row. The rails' zone headings sit below it, in their
            first hour. */}
          <div className={styles.rail} />
          <div data-slide className="relative grid" style={row}>
            {days.map((d, index) => heading(d, index))}
            {besideHeadings}
          </div>
          {!compact && <div />}

          {/* Body row: the booker's rail, the Days, the host's rail */}
          <div className={cn(styles.rail, "relative")} style={{ height }}>
            {/* The zone heading takes the first hour, in place of its label. */}
            <div
              data-covered={
                nowInHours && y(nowMinute) < INSET + ZONE_HEADING + NOW_PILL / 2
                  ? ""
                  : undefined
              }
              className={cn(
                styles.secondary,
                styles.zoneHeading,
                "items-end text-right",
                compact ? "pr-1.5" : "pr-2",
              )}
            >
              <span>{zoneLabel(referenceMoment, bookerZone)}</span>
              <span className={styles.zoneWho}>
                {twoClocks ? "You" : `You & ${host}`}
              </span>
            </div>
            {hours
              .filter((m) => m > bounds.start)
              .map((minute) => (
                <span
                  key={minute}
                  aria-hidden
                  data-covered={covered(minute) ? "" : undefined}
                  className={cn(
                    styles.railLabel,
                    "text-right",
                    compact ? "pr-1.5" : "pr-2",
                  )}
                  style={{ top: y(minute) }}
                >
                  <DateText text={bookerHour(minute)} />
                </span>
              ))}
            {/* Now's time, flush with the Days' edge, where today's line
              meets it. It shows on any week, at the same clock time. */}
            {pill !== null && (
              <span
                aria-hidden
                data-hidden={nowInHours ? undefined : ""}
                className={styles.nowPill}
                style={{ top: y(pill) }}
              >
                <SwapText tick text={bareClockLabel(now!, bookerZone)} />
              </span>
            )}
          </div>

          <div
            data-slide
            className="relative"
            style={{ gridColumn: row.gridColumn }}
          >
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
              className={cn(styles.days, "grid")}
              style={{
                gridTemplateColumns: row.gridTemplateColumns,
                ["--hour" as string]: `${60 * PX}px`,
              }}
            >
              {days.map((d, index) => dayColumn(d, index))}
              {/* The meeting and the hover block ride over the Days, not in
              one, so a move to another Day slides there. Each starts fresh
              when the Days step. */}
              {hoverDay && hover && hover.start !== selection && (
                <div
                  key={`ghost ${days[0]?.day}`}
                  className={styles.ghost}
                  style={{
                    ...column(hoverIndex),
                    top: top(hover.start, hoverDay.day) + GAP,
                    height: length * PX - 2 * GAP,
                  }}
                />
              )}
              {selectionDay && selection !== null && (
                <div
                  key={`selection ${days[0]?.day}`}
                  data-selection
                  data-column={selectionIndex}
                  data-dragging={dragging ? "" : undefined}
                  data-best={suggestions.includes(selection) ? "" : undefined}
                  className={cn(
                    styles.selection,
                    "flex flex-col px-1.5",
                    length >= 45
                      ? "justify-start gap-0.5 py-1.5 leading-tight"
                      : "justify-center gap-0.5 leading-none",
                  )}
                  style={{
                    ["--col" as string]: selectionIndex,
                    ...column(selectionIndex),
                    top: top(selection, selectionDay.day) + GAP,
                    height: length * PX - 2 * GAP,
                  }}
                >
                  {/* A best time keeps its star, in white on the blue. */}
                  {suggestions.includes(selection) && (
                    <StarIcon
                      aria-hidden
                      weight="fill"
                      size={9}
                      className={styles.selectionDot}
                    />
                  )}
                  {/* The Day over the time, as the card reads them. A block
                  too short or narrow for both keeps the time: see
                  .selectionDate. */}
                  <span
                    className={cn(
                      styles.selectionDate,
                      "truncate text-[10.5px] font-medium opacity-85",
                    )}
                  >
                    <DateText
                      rolls
                      text={dayLabel(zonedDate(selection, bookerZone))}
                    />
                  </span>
                  <span className="truncate text-[11.5px] tabular-nums">
                    {length >= 45 ? (
                      <>
                        <DateText text={blockRange!.start} rolls />
                        <span className={styles.dash}>-</span>
                        <DateText text={blockRange!.end} rolls />
                      </>
                    ) : (
                      <DateText
                        text={shortClock(selection, bookerZone)}
                        rolls
                      />
                    )}
                  </span>
                  {twoClocks && (
                    <span
                      className={cn(
                        styles.selectionHost,
                        "truncate text-[10.5px] tabular-nums opacity-80",
                      )}
                    >
                      <DateText
                        rolls
                        text={`${shortClock(selection, hostZone)} ${zoneLabel(selection, hostZone)}`}
                      />
                    </span>
                  )}
                </div>
              )}
            </div>
            {besideDays}
          </div>

          {!compact && (
            <div className="relative" style={{ height }}>
              {hostRail && (
                <div
                  className={cn(
                    styles.secondary,
                    styles.zoneHeading,
                    "items-start pl-2",
                  )}
                >
                  <span>{zoneLabel(referenceMoment, hostZone)}</span>
                  <span className={cn(styles.zoneWho, "max-w-full truncate")}>
                    {host}
                  </span>
                </div>
              )}
              {hostRail &&
                hours
                  .filter((m) => m > bounds.start)
                  .map((minute) => (
                    <span
                      key={minute}
                      aria-hidden
                      className={cn(styles.railLabel, "pl-2")}
                      style={{ top: y(minute) }}
                    >
                      <DateText
                        text={hourLabel(
                          momentOnDay(reference, minute, hostZone),
                          hostZone,
                        )}
                      />
                    </span>
                  ))}
            </div>
          )}
        </div>
        {/* The how-to, for screen readers; a pointer finds it on a best star. */}
        <p id={hintId} className="sr-only">
          {compact ? TAP_HINT : PRESS_HINT}
        </p>
      </div>
    </TooltipProvider>
  );
}

const PRESS_HINT =
  "Press an open time or drag the meeting. With the keyboard, arrow keys move it to the next start or day, Shift moves an hour, and Enter continues.";
const TAP_HINT =
  "Tap an open time or drag the meeting. Swipe the days for more.";

/**
 * A best time's blue star, brighter than white on an HDR screen. Hovered, it says "Best time" and no more. The
 * tooltip draws inside .meet-root so it takes the page's colours and font;
 * a tap-first phone has no hover, so there a tap just picks the time.
 */
function BestDot({ top }: { top: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-hidden className={styles.bestTarget} style={{ top }}>
          <span className={styles.bestDot}>
            <StarIcon weight="fill" size={9} />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipPrimitive.Portal
        container={
          typeof document === "undefined"
            ? undefined
            : document.querySelector<HTMLElement>(".meet-root")
        }
      >
        <TooltipPrimitive.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            styles.tip,
            "z-[100] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <span aria-hidden className={styles.tipDot}>
              <StarIcon weight="fill" size={10} />
            </span>
            Best time
          </p>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

/** The pieces that move with a swipe: the Days' headings and columns. */
function slidingParts(frame: HTMLElement | null): HTMLElement[] {
  return [...(frame?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])];
}
