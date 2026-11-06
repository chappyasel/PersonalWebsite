"use client";

import {
  ArrowClockwiseIcon,
  ArrowUUpLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MapPinIcon,
  StarIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

import {
  type BookingDay,
  type BookingPage,
  PHONE_DAYS,
  READ_DAYS,
  WEEK,
  addDays,
  blockStart,
  callLabel,
  daysBetween,
  daysFitting,
  stepLabel,
  windowStart,
} from "~/lib/booking/page";
import {
  type Attempt,
  type BookResult,
  type Booked,
  MESSAGES,
  attemptFor,
  attemptKey,
  linkedinAddress,
  recoveryFor,
} from "~/lib/booking/request";
import {
  MINUTE,
  dayHolding,
  nearestStart,
  resize,
  suggestedFor,
} from "~/lib/booking/slots";
import { momentOnDay } from "~/lib/booking/strip";
import {
  browserTimeZone,
  rangeLabel,
  shortClock,
  slotSentence,
  slotText,
  untilLabel,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { FadeIn, SwapText } from "~/components/ui/rolling-text";

import { BookDust } from "./BookDust";
import { BookingSheet, type SheetState, SwipeHint } from "./BookingSheet";
import { DateText } from "./DateText";
import { Duration } from "./Duration";
import { PressButton } from "./PressButton";
import { Pop, Reveal } from "./Reveal";
import { SpokenTimes } from "./SpokenTimes";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { WeekStrip, layoutTop } from "./WeekStrip";
import { Confirmation } from "./confirmed/Confirmation";
import {
  type Handoff,
  type Seed,
  canAnimate,
  reassemble,
  sampleForm,
  takeRing,
} from "./confirmed/dust";
import { tick } from "./haptics";
import styles from "./meet.module.css";
import { STICKY_HEADER } from "./sticky";
import { useFits } from "./useFits";

const noSubscription = () => () => undefined;

/** The booking form, which the phone's docked Book button submits from
 * outside it. */
const FORM_ID = "meet-booking";

/**
 * Below 872px, the phone's layout: the Days alone, with the booking in the
 * bar at the screen's foot. From 872px the card sits beside the Days: 3 of
 * them at first, 4 from 912px (32px of page sides, 4 Days of `DAY_MIN` and
 * both rails, the 40px gap, the 21rem card). The form never sits under the
 * schedule. The classes that switch with it say
 * `min-[872px]` and `max-[871.98px]`.
 */
const PHONE_QUERY = "(max-width: 871.98px)";

function isPhone(): boolean {
  return window.matchMedia?.(PHONE_QUERY).matches ?? false;
}

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/** A phone's width after hydration; the server draws the computer's page. */
function usePhone() {
  return useSyncExternalStore(subscribePhone, isPhone, () => false);
}

/** The browser's zone after hydration; null while the server renders. */
function useBookerZone() {
  return useSyncExternalStore(noSubscription, browserTimeZone, () => null);
}

/** The width of the column the grid draws in, once measured. */
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver !== "function") return;
    // Zero is a column not laid out yet.
    const measure = () => setWidth(element.clientWidth || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Where the computer's calendar starts below the column's top, under its
 * nav and Day headings, so the card beside lines up with it. */
const CALENDAR_TOP = 80;
/** The panel's rounded top the grid's sticky head draws over it: .cap. */
const PANEL_TOP = 12;
function useCalendarTop(ref: React.RefObject<HTMLElement | null>) {
  const [top, setTop] = useState({ rest: CALENDAR_TOP, stuck: CALENDAR_TOP });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const shown = (e: HTMLElement) => e.getClientRects().length > 0;
      const grid = [
        ...element.querySelectorAll<HTMLElement>('[role="group"]'),
      ].find(shown);
      const head = [
        ...element.querySelectorAll<HTMLElement>("[data-sticky-head]"),
      ].find(shown);
      // No calendar shown, or it's a phone's: the card keeps where it was.
      if (!grid || !head) return;
      // As laid out: the column's entrance would shift a measured rect.
      // Stuck, the grid's top sits its sticky head's height under the
      // window's top, less the panel's top that the head draws over it.
      const rest = layoutTop(grid) - layoutTop(element);
      const stuck = head.offsetHeight - PANEL_TOP;
      setTop((was) =>
        was.rest === rest && was.stuck === stuck ? was : { rest, stuck },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return top;
}

/** Enough of an email to name the invite by; the server checks it. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A first name past this many letters ends in an ellipsis in the
 * invite's name, as one over a hundred long once did. */
const NAME_LETTERS = 20;
function shortName(name: string) {
  const letters = [...name];
  return letters.length > NAME_LETTERS
    ? `${letters.slice(0, NAME_LETTERS).join("").trimEnd()}…`
    : name;
}

/** How far past the shown Days the page keeps read, so a step never waits. */
const READ_AHEAD = 2 * WEEK;

/**
 * The `from` of each read block the page keeps: the ones holding the Days
 * a week before the shown ones through `READ_AHEAD` after them.
 */
function blocksNear(firstDay: string, lastDay: string, offset: number) {
  const first = Math.floor(Math.max(0, offset - WEEK) / READ_DAYS);
  const last = Math.floor((offset + WEEK - 1 + READ_AHEAD) / READ_DAYS);
  const froms: string[] = [];
  for (let block = first; block <= last; block++) {
    const from = addDays(firstDay, block * READ_DAYS);
    if (from <= lastDay) froms.push(from);
  }
  return froms;
}

type Selected = { start: number; day: BookingDay };

type Fields = { name: string; email: string; about: string; linkedin: string };

const EMPTY: Fields = { name: "", email: "", about: "", linkedin: "" };

/** The first best time, which the page opens on, and the Day holding it. */
function firstBest(initial: BookingPage): Selected | null {
  const { days, suggested, link } = initial;
  const [start] = suggestedFor(
    days,
    suggested,
    link.defaultLength,
    link.defaultLength,
  );
  const day = start === undefined ? undefined : dayHolding(days, start);
  return start !== undefined && day ? { start, day } : null;
}

export function MeetBooking({
  slug,
  initial,
  turnstileSiteKey,
}: {
  slug: string;
  initial: BookingPage;
  turnstileSiteKey?: string;
}) {
  const hostZone = initial.timeZone;
  const bookerZone = useBookerZone() ?? hostZone;
  const phone = usePhone();
  // The Days across the grid, by its width; before it's measured, a
  // phone's 3 or a computer's week. The page draws both grids and shows
  // one by the screen's width, so a phone's first paint is already its
  // own; `count` is the one shown.
  const column = useRef<HTMLDivElement>(null);
  const width = useWidth(column);
  const calendarTop = useCalendarTop(column);
  const phoneCount = width === null ? PHONE_DAYS : daysFitting(width, true);
  const weekCount = width === null ? WEEK : daysFitting(width, false);
  const count = phone ? phoneCount : weekCount;
  const { host } = initial.link;
  const { firstDay, lastDay } = initial;

  const [selected, setSelected] = useState<Selected | null>(() =>
    firstBest(initial),
  );
  // Days after the first bookable one, stepping by the Days shown. It
  // opens on the first Day with time to book, never an empty one, or on
  // the first best time's Day when that's past a phone's Days from it.
  const [offset, setOffset] = useState(() => {
    const open = initial.days.find((d) => d.open.length > 0);
    const from = open ? daysBetween(firstDay, open.day) : 0;
    const best = selected ? daysBetween(firstDay, selected.day.day) : from;
    return best - from < PHONE_DAYS ? from : best;
  });

  // The page reads 28 Days at a time and keeps the blocks around the shown
  // Days read, so stepping and swiping land on Days already in hand.
  const froms = blocksNear(firstDay, lastDay, offset);
  const reads = api.useQueries((t) =>
    froms.map((from) =>
      t.booking.page(
        { slug, from },
        {
          initialData:
            from === firstDay
              ? { status: "open" as const, page: initial }
              : undefined,
          staleTime: 30_000,
        },
      ),
    ),
  );
  const utils = api.useUtils();
  const readFor = (day: string) =>
    reads[froms.indexOf(blockStart(firstDay, daysBetween(firstDay, day)))];

  const known = new Map<string, BookingDay>();
  const suggestedAll: number[] = [];
  let link = initial.link;
  for (const read of reads) {
    if (read.data?.status !== "open") continue;
    const { page } = read.data;
    for (const day of page.days) known.set(day.day, day);
    suggestedAll.push(...page.suggested);
    link = page.link;
  }
  const loaded = [...known.values()].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );
  const shownDates = (count: number, from = offset) =>
    Array.from({ length: count }, (_, i) => addDays(firstDay, from + i)).filter(
      (day) => day >= firstDay && day <= lastDay,
    );
  const shown = (count: number, from = offset) =>
    shownDates(count, from).map((day) => known.get(day) ?? { day, open: [] });
  const days = shown(weekCount);
  const phoneDays = shown(phoneCount);
  // A Day whose block hasn't come back yet, among the shown Days and the
  // Days a swipe brings in on either side; a read block that left a
  // Day out has nothing open on it.
  const pending = new Set(
    shownDates(weekCount + 2 * phoneCount, offset - phoneCount).filter(
      (day) => readFor(day)?.data === undefined,
    ),
  );
  // The blocks holding the shown Days, for a read that failed or closed.
  const shownReads = [...new Set(shownDates(count).map(readFor))].filter(
    (read) => read !== undefined,
  );
  const failed = shownReads.filter(
    (read) => read.isError || read.data?.status === "unavailable",
  );
  const closed = shownReads.some((read) => read.data?.status === "closed");

  const [length, setLength] = useState(initial.link.defaultLength);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [token, setToken] = useState<string | null>(null);
  const [failure, setFailure] = useState<Extract<
    BookResult,
    { ok: false }
  > | null>(null);
  // Back from the confirmation, its dust becomes the booking screen: each
  // grain flies to a place on the screen as it now stands, the form's
  // words, fields and Book button and the Days' panel, and the screen
  // comes in under the dust as it settles.
  const returning = useRef<Seed[] | null>(null);
  const [booked, setBooked] = useState<{
    booked: Booked;
    email: string;
    from: Handoff | null;
  } | null>(null);
  useLayoutEffect(() => {
    const dust = returning.current;
    if (booked || !dust) return;
    returning.current = null;
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    const book = [...document.querySelectorAll("[data-book]")].find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    const stop = reassemble(dust, sampleForm(form, book ?? null));
    form.closest("main")?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
      duration: 460,
      delay: 480,
      easing: "ease-out",
      fill: "backwards",
    });
    return stop;
  }, [booked]);
  const [sheet, setSheet] = useState<SheetState>(() =>
    selected ? "peek" : "closed",
  );
  const [focusName, setFocusName] = useState(0);
  // Now, once mounted, so the server and the first render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const attempt = useRef<Attempt | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const bookedHeading = useRef<HTMLHeadingElement>(null);
  const book = api.booking.book.useMutation();

  const suggestions = suggestedFor(
    loaded,
    suggestedAll,
    link.defaultLength,
    length,
  );
  const selection = selected?.start ?? null;
  const best = selection !== null && suggestions.includes(selection);
  // The best time nearest the one picked, for the way back to it.
  const nearestBest =
    selection === null || suggestions.length === 0
      ? null
      : suggestions.reduce((near, start) =>
          Math.abs(start - selection) < Math.abs(near - selection)
            ? start
            : near,
        );

  const select = (start: number) => {
    const day = dayHolding(loaded, start);
    if (!day) return;
    // A tick under the finger for a new time; outside a tap it does nothing.
    if (start !== selected?.start) tick();
    setSelected({ start, day });
    setFailure(null);
    setSheet((at) => (at === "closed" ? "peek" : at));
  };

  /** Picks the nearest best time, stepping the Days to it if it's out of view. */
  const toBest = () => {
    if (nearestBest === null) return;
    const day = dayHolding(loaded, nearestBest);
    if (!day) return;
    const index = daysBetween(firstDay, day.day);
    setOffset((at) => (index >= at && index < at + count ? at : index));
    select(nearestBest);
  };

  const pickLength = (next: number) => {
    setLength(next);
    if (!selected) return;
    const start = resize(selected.day.open, selected.start, next);
    setSelected(start === null ? null : { start, day: selected.day });
  };

  useEffect(() => {
    if (booked) bookedHeading.current?.focus();
  }, [booked]);

  // After the sheet opens, so its fields take focus.
  useEffect(() => {
    if (focusName > 0) nameField.current?.focus();
  }, [focusName]);

  /** On a phone the card grows out of the floating bar. A tap on the grid
   * only moves the time in the bar; confirming one, or picking from the
   * spoken list, opens the card to go on booking. */
  const showCard = () => {
    if (phone) setSheet("full");
  };

  const confirm = () => {
    showCard();
    setFocusName((n) => n + 1);
  };

  const until =
    selection === null || now === null
      ? null
      : untilLabel(selection, now, bookerZone);
  const namedDay =
    until?.day === "today"
      ? "Today"
      : until?.day === "tomorrow"
        ? "Tomorrow"
        : null;

  const slot =
    selection === null
      ? null
      : slotText(selection, selection + length * MINUTE, hostZone, bookerZone);
  const dayLine = useFits<HTMLSpanElement, HTMLSpanElement>(
    `${slot?.booker.day ?? ""}|${until?.day ?? ""}`,
  );
  const announcement = slot
    ? `${slotSentence(slot, host)}${best ? ", best" : ""}.`
    : "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selection === null || book.isPending) return;
    const form = event.currentTarget;
    // The phone's Book button docks outside the form (form="…").
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const button =
      submitter instanceof HTMLElement
        ? submitter
        : (form.querySelector<HTMLElement>("button[type=submit]") ??
          document.querySelector<HTMLElement>(
            `[data-book][form="${form.id}"]`,
          ));
    const linkedin = linkedinAddress(fields.linkedin);
    const request = {
      start: selection,
      length,
      name: fields.name.trim(),
      email: fields.email.trim(),
      ...(fields.about.trim() ? { about: fields.about.trim() } : {}),
      ...(linkedin ? { linkedin } : {}),
    };
    attempt.current = attemptFor(attempt.current, attemptKey(request));
    let answer: BookResult;
    try {
      answer = await book.mutateAsync({
        slug,
        ...request,
        requestId: attempt.current.requestId,
        ...(token ? { turnstileToken: token } : {}),
      });
    } catch {
      answer = {
        ok: false,
        code: "unavailable",
        message: MESSAGES.unavailable,
      };
    }
    turnstile.current?.reset();
    if (answer.ok) {
      // The confirmation's dust bursts from the Book button, where it is
      // on the screen. The confirmation opens at the page's top, so a
      // phone that scrolled down to the form doesn't open it half off
      // the screen: the button's place on the screen is its place on the
      // page from there.
      //
      // And the form becomes that dust: the Book button's ring and the
      // form's own dust, taken where they are on the screen, and the
      // confirmation drawn in the same frame (flushSync, and its layout
      // effect), so the form never blinks out before its dust is there.
      const at = button?.getBoundingClientRect();
      const centre = at
        ? { x: at.left + at.width / 2, y: at.top + at.height / 2 }
        : null;
      const seeds = canAnimate()
        ? [...takeRing(), ...sampleForm(form, button ?? null)]
        : [];
      attempt.current = null;
      document.scrollingElement?.scrollTo?.({ top: 0, behavior: "instant" });
      flushSync(() => {
        setSheet("closed");
        setBooked({
          booked: answer.booked,
          email: request.email,
          from:
            centre || seeds.length
              ? { ...(centre ?? { x: innerWidth / 2, y: innerHeight }), seeds }
              : null,
        });
      });
      void utils.booking.page.invalidate();
      return;
    }
    setFailure(answer);
    if (recoveryFor(answer.code) === "repick") {
      attempt.current = null;
      setSelected(null);
      setSheet("closed");
      void utils.booking.page.invalidate();
    }
  };

  const reset = (dust?: Seed[]) => {
    returning.current = dust ?? null;
    setBooked(null);
    setSelected(null);
    setFields((f) => ({ ...f, about: "" }));
    setFailure(null);
  };

  if (booked) {
    return (
      <Confirmation
        from={booked.from}
        booked={booked.booked}
        email={booked.email}
        host={host}
        hostZone={hostZone}
        bookerZone={bookerZone}
        call={link.call}
        headingRef={bookedHeading}
        onAnother={reset}
      />
    );
  }

  const canGo = (by: number) =>
    by < 0 ? offset > 0 : windowStart(firstDay, lastDay, offset + by) !== null;
  const go = (by: number) => setOffset((o) => Math.max(0, o + by));
  /**
   * The arrow keys past the first or last Day shown: the meeting moves to
   * the same time on the nearest Day beyond with room for it, and the Days
   * step by `step` until that Day is in view. With nothing open in hand
   * beyond, the Days step once so the next read comes in.
   */
  const pastEdge = (step: number) => (direction: 1 | -1, minute: number) => {
    const inView = shownDates(step);
    const edge = direction > 0 ? inView.at(-1) : inView[0];
    if (!edge) return;
    const beyond =
      direction > 0
        ? loaded.filter((d) => d.day > edge)
        : loaded.filter((d) => d.day < edge).reverse();
    for (const day of beyond) {
      const start = nearestStart(
        day.open,
        momentOnDay(day.day, minute, hostZone),
        length,
      );
      if (start === null) continue;
      const index = daysBetween(firstDay, day.day);
      let next = offset;
      while (index < next || index >= next + step) next += direction * step;
      setOffset(Math.max(0, next));
      select(start);
      return;
    }
    if (canGo(direction * step)) go(direction * step);
  };
  const gridShown = failed.length === 0 && !closed;
  const navFor = (n: number, shownDays: BookingDay[]) => (
    <DayNav
      unit={n >= WEEK ? "week" : "days"}
      shown={shownDays}
      offset={offset}
      canEarlier={canGo(-n)}
      canLater={canGo(n)}
      onStep={(direction) => go(direction * n)}
      onReturn={() => go(-offset)}
    />
  );
  const weekNav = navFor(weekCount, days);
  const daysNav = navFor(phoneCount, phoneDays);
  const needsToken = Boolean(turnstileSiteKey);
  const canBook =
    selection !== null && !book.isPending && (!needsToken || token !== null);
  const CallIcon = link.call.kind === "place" ? MapPinIcon : VideoCameraIcon;
  const firstName = shortName(fields.name.trim().split(/\s+/)[0] ?? "");
  const named = !!firstName && LOOKS_LIKE_EMAIL.test(fields.email.trim());

  // The Book button and what's said under it: at the form's end beside the
  // Days, docked at the phone card's foot.
  const bookDock = (
    <>
      <PressButton
        type="submit"
        // On a phone it docks at the card's foot, outside the form.
        form={FORM_ID}
        disabled={!canBook}
        className="w-full"
        data-book
      >
        <ButtonLabel
          state={
            book.isPending
              ? "Booking..."
              : failure && recoveryFor(failure.code) === "retry"
                ? "Try again"
                : selection === null
                  ? "Pick a time first"
                  : null
          }
          length={length}
        />
      </PressButton>
      {needsToken &&
        token === null &&
        selection !== null &&
        !book.isPending && (
          <p className={cn(styles.secondary, "text-center text-xs")}>
            Checking you&apos;re a person...
          </p>
        )}
    </>
  );

  const form = (
    <form
      id={FORM_ID}
      onSubmit={(event) => void submit(event)}
      // The computer's card never scrolls inside itself: in a window too
      // short to hold it stuck, it scrolls with the page (.cardAside).
      className={cn("space-y-4", phone ? "px-5" : cn(styles.card, "p-5"))}
    >
      {/* The sheet's peek shows down to the end of this block. */}
      <div data-peek-end>
        {slot ? (
          <>
            {/* In the phone's bar, the date and the time sit close, as one
              block. */}
            <p
              className={cn(
                "flex items-center justify-between gap-2 text-[19px] font-bold tracking-[-0.01em]",
                phone && "leading-tight",
              )}
            >
              <span
                ref={dayLine.room}
                className="relative min-w-0 flex-1 truncate"
              >
                {/* Today and Tomorrow by name, in place of the date; a Day
                    further off keeps its date, with how far it is, where
                    the line holds both whole. */}
                <span
                  ref={dayLine.whole}
                  aria-hidden
                  className={cn(
                    styles.measure,
                    "invisible absolute left-0 whitespace-pre",
                  )}
                >
                  <DateText measure text={namedDay ?? slot.booker.day} />
                  <span
                    data-t={` · ${until?.day ?? ""}`}
                    className={cn(styles.aside, "font-medium")}
                  />
                </span>
                <DateText text={namedDay ?? slot.booker.day} rolls />
                <Reveal
                  show={!!until?.day && !namedDay && dayLine.fits}
                  className={cn(styles.secondary, styles.aside, "font-medium")}
                >
                  <span className={styles.dot}> · </span>
                  <SwapText text={until?.day ?? ""} />
                </Reveal>
              </span>
              {/* Best, or away from the best times, a quiet way back to
                  the nearest one. They trade places, each popping. */}
              <span className={styles.badgeSlot}>
                <Pop show={best} className={styles.capsule}>
                  <StarIcon aria-hidden weight="fill" size={10} />
                  Best
                </Pop>
                <Pop show={!best && nearestBest !== null} className="flex">
                  <button
                    type="button"
                    aria-label="Back to the nearest best time"
                    onClick={toBest}
                    className={styles.capsuleBack}
                  >
                    <ArrowUUpLeftIcon aria-hidden weight="bold" size={10} />
                    Best
                  </button>
                </Pop>
              </span>
            </p>
            <p
              className={cn(
                "text-[17px] font-bold tabular-nums",
                phone && "mt-0.5 leading-tight",
              )}
            >
              <DateText text={slot.booker.short.start} rolls />
              <span className={styles.dash}>-</span>
              <DateText text={slot.booker.short.end} rolls />{" "}
              {/* The zone a step smaller than the time, as everywhere. */}
              <span className={cn(styles.secondary, styles.zone)}>
                {slot.booker.zone}
              </span>
              <span className={cn(styles.secondary, styles.aside)}>
                <Reveal show={!!until?.time} className="font-medium">
                  <span className={styles.dot}> · </span>
                  <DateText text={until?.time ?? ""} rolls />
                </Reveal>
              </span>
            </p>
            {!slot.sameClock && (
              <p className={cn(styles.secondary, "text-[13px] tabular-nums")}>
                <DateText rolls text={shortClock(selection!, hostZone)} />{" "}
                <span className={styles.zone}>{slot.host.zone}</span>
                <DateText
                  rolls
                  text={` for ${host}${slot.dateDiffers ? `, ${slot.host.day}` : ""}`}
                />
              </p>
            )}
            {phone && <SwipeHint open={sheet === "full"} cue={selection} />}
          </>
        ) : (
          <p className={cn(styles.secondary, "text-sm")}>
            Pick a time to book it here.
          </p>
        )}
      </div>

      <fieldset disabled={book.isPending} className="space-y-3">
        <Field label="Name" id="meet-name">
          <Input
            ref={nameField}
            id="meet-name"
            enterKeyHint="next"
            onKeyDown={nextField}
            required
            maxLength={100}
            autoComplete="name"
            value={fields.name}
            onChange={(e) => setFields({ ...fields, name: e.target.value })}
            className={styles.input}
          />
        </Field>
        <Field label="Email" id="meet-email">
          <Input
            id="meet-email"
            type="email"
            enterKeyHint="next"
            onKeyDown={nextField}
            required
            maxLength={254}
            autoComplete="email"
            value={fields.email}
            onChange={(e) => setFields({ ...fields, email: e.target.value })}
            className={styles.input}
          />
        </Field>
        <Field label="LinkedIn" id="meet-linkedin" optional>
          <Input
            id="meet-linkedin"
            inputMode="url"
            autoComplete="url"
            enterKeyHint="next"
            onKeyDown={nextField}
            maxLength={200}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="/in/chappyasel"
            value={fields.linkedin}
            onChange={(e) => setFields({ ...fields, linkedin: e.target.value })}
            className={styles.input}
          />
        </Field>
        <Field label="What it's about" id="meet-about" optional>
          <GrowingText
            id="meet-about"
            maxLength={200}
            value={fields.about}
            onChange={(about) => setFields({ ...fields, about })}
          />
        </Field>
      </fieldset>

      {turnstileSiteKey && (
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          onToken={setToken}
        />
      )}

      {failure && recoveryFor(failure.code) !== "repick" && (
        <Problem>{failure.message}</Problem>
      )}

      {/* Where the meeting happens, the form's last line, half as far over
        the Book button as the fields sit from it. */}
      <p
        className={cn(styles.secondary, "flex items-center gap-2 text-[13px]")}
      >
        <CallIcon size={16} aria-hidden className="shrink-0" />
        <span className="flex min-w-0 items-baseline">
          <span className="shrink-0">{callLabel(link.call)}</span>
          {/* The invite's name, as the booking will title it, once
            there's a name and an email to send it to. A long first name
            ends in an ellipsis, short of the host's. */}
          <Reveal show={named} className="min-w-0">
            <span className="flex min-w-0">
              <span className={cn(styles.dot, "shrink-0")}> · </span>
              <span className="truncate">{firstName}</span>
              <span className="shrink-0"> 🤝 {host}</span>
            </span>
          </Reveal>
        </span>
      </p>

      {!phone && <div className="!mt-2 space-y-4">{bookDock}</div>}
    </form>
  );

  return (
    <div className="grid gap-x-10 gap-y-8 min-[872px]:grid-cols-[minmax(0,1fr)_21rem]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <BookDust ready={named && canBook} />

      <div ref={column} className="min-w-0 space-y-5">
        {(link.lengths.length > 1 || !gridShown) && (
          <div
            data-enter
            style={{ ["--enter" as string]: 2 }}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            {link.lengths.length > 1 && (
              <div
                role="group"
                aria-label="Length"
                className={styles.segmented}
              >
                {link.lengths.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={option === length}
                    onClick={() => pickLength(option)}
                    className={styles.segment}
                  >
                    <Duration minutes={option} />
                  </button>
                ))}
              </div>
            )}
            {/* Over the grid when it's drawn; here when a read failed. */}
            {!gridShown && (
              <>
                <div className="ml-auto hidden min-[872px]:block">
                  {weekNav}
                </div>
                <div className="ml-auto min-[872px]:hidden">{daysNav}</div>
              </>
            )}
          </div>
        )}

        {failure && recoveryFor(failure.code) === "repick" && (
          <Problem>{failure.message}</Problem>
        )}

        {failed.length > 0 ? (
          <div
            className={cn(
              styles.secondary,
              "flex items-center gap-3 py-10 text-sm",
            )}
          >
            Couldn&apos;t load these days.
            <Button
              type="button"
              size="sm"
              onClick={() => {
                for (const read of failed) void read.refetch();
              }}
              className={styles.quiet}
            >
              <ArrowClockwiseIcon aria-hidden />
              Try again
            </Button>
          </div>
        ) : closed ? (
          <p className={cn(styles.secondary, "py-10 text-sm")}>
            {MESSAGES.closed}
          </p>
        ) : (
          <div
            data-enter
            style={{ ["--enter" as string]: 3 }}
            aria-busy={pending.size > 0 || undefined}
          >
            <div className="hidden min-[872px]:block">
              <WeekStrip
                days={days}
                pending={pending}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onSelect={select}
                onConfirm={confirm}
                onPastEdge={pastEdge(weekCount)}
                nav={weekNav}
                onStep={(direction) => go(direction * weekCount)}
                canStep={{
                  earlier: canGo(-weekCount),
                  later: canGo(weekCount),
                }}
                peek={{
                  earlier: canGo(-weekCount)
                    ? shown(weekCount, Math.max(0, offset - weekCount))
                    : undefined,
                  later: canGo(weekCount)
                    ? shown(weekCount, offset + weekCount)
                    : undefined,
                }}
              />
            </div>
            <div className="min-[872px]:hidden">
              <WeekStrip
                compact
                days={phoneDays}
                boundsDays={loaded}
                pending={pending}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onSelect={select}
                onConfirm={confirm}
                onStep={(direction) => go(direction * phoneCount)}
                onPastEdge={pastEdge(phoneCount)}
                nav={daysNav}
                canStep={{
                  earlier: canGo(-phoneCount),
                  later: canGo(phoneCount),
                }}
                peek={{
                  earlier: canGo(-phoneCount)
                    ? shown(phoneCount, Math.max(0, offset - phoneCount))
                    : undefined,
                  later: canGo(phoneCount)
                    ? shown(phoneCount, offset + phoneCount)
                    : undefined,
                }}
              />
              <SpokenTimes
                days={phoneDays}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onSelect={(start) => {
                  select(start);
                  showCard();
                }}
              />
            </div>
          </div>
        )}

        {/* Room under the grid for the floating bar, so the last hours scroll clear of it. */}
        {phone && sheet !== "closed" && <div aria-hidden className="h-36" />}
      </div>

      {phone ? (
        <BookingSheet
          state={sheet}
          onState={setSheet}
          label="Your booking"
          dock={bookDock}
        >
          {form}
        </BookingSheet>
      ) : (
        <aside
          data-enter
          // Level with the calendar's top, under its nav and Day headings.
          style={{
            ["--enter" as string]: 5,
            ["--card-top" as string]: STICKY_HEADER
              ? `calc(env(safe-area-inset-top, 0px) + ${calendarTop.stuck}px)`
              : "1rem",
            marginTop: calendarTop.rest,
            top: "var(--card-top)",
          }}
          aria-label="Your booking"
          className={cn(
            styles.cardAside,
            "w-full max-[871.98px]:hidden min-[872px]:self-start",
          )}
        >
          {form}
        </aside>
      )}
    </div>
  );
}

/** The arrows and the range they step: the Days shown, a week at the most.
 * Away from the first, a dot before them goes back to it. */
function DayNav({
  unit,
  shown,
  offset,
  canEarlier,
  canLater,
  onStep,
  onReturn,
}: {
  unit: "week" | "days";
  shown: BookingDay[];
  /** Days from the first bookable one to the first shown. */
  offset: number;
  canEarlier: boolean;
  canLater: boolean;
  onStep: (direction: 1 | -1) => void;
  onReturn: () => void;
}) {
  const away = offset > 0;
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label={`Earlier ${unit}`}
        disabled={!canEarlier}
        onClick={() => onStep(-1)}
        className={styles.chevron}
      >
        <CaretLeftIcon size={14} weight="bold" aria-hidden />
      </button>
      {/* How far out, since each Day carries its own date; the dates are
        for a screen reader, which can't glance at the columns. Away from
        the first, a blue dot over its end marks it, and a press anywhere
        on it goes back. */}
      <button
        type="button"
        disabled={!away}
        onClick={onReturn}
        className={cn(
          styles.navLabel,
          // 9px each side, so the arrows sit clear of the words.
          "px-[9px] text-center text-[15px] font-bold tabular-nums",
        )}
      >
        <span className="relative inline-block">
          <SwapText text={stepLabel(offset, shown.length)} />
          <Pop show={away} className={styles.navReturnDot}>
            {null}
          </Pop>
        </span>
        {shown.length > 0 && (
          <span className="sr-only">
            , {rangeLabel(shown[0]!.day, shown.at(-1)!.day)}
          </span>
        )}
        {away && (
          <span className="sr-only">
            , back to {unit === "week" ? "this week" : "today"}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={`Later ${unit}`}
        disabled={!canLater}
        onClick={() => onStep(1)}
        className={styles.chevron}
      >
        <CaretRightIcon size={14} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The submit button's words. A change of state fades in; "Book 30m" stays
 * one state while its length rolls.
 */
/**
 * Return in a field goes on to the next one, the way the keyboard's arrows
 * do, rather than sending the form early, so return steps through all four
 * fields even where iOS shows no arrows.
 */
function nextField(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  const fields = [
    ...(event.currentTarget.form?.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), textarea",
    ) ?? []),
  ];
  const next = fields[fields.indexOf(event.currentTarget) + 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

function ButtonLabel({
  state,
  length,
}: {
  state: string | null;
  length: number;
}) {
  return (
    <FadeIn key={state ?? "book"} fades>
      {state ?? (
        <>
          Book <Duration minutes={length} rolls />
        </>
      )}
    </FadeIn>
  );
}

/** One line tall, growing with what's typed up to five, then scrolling. */
function GrowingText({
  id,
  maxLength,
  value,
  onChange,
}: {
  id: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        styles.input,
        styles.growing,
      )}
    />
  );
}

/** A refusal or failure, in the ink with an icon: red is only the now line. */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm font-semibold">
      <WarningCircleIcon
        size={16}
        weight="fill"
        className="mt-[2px] shrink-0"
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

function Field({
  label,
  id,
  optional,
  children,
}: {
  label: string;
  id: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={cn(styles.label, "flex items-baseline justify-between")}
      >
        {label}
        {optional && <span className={styles.optional}>Optional</span>}
      </label>
      {children}
    </div>
  );
}
