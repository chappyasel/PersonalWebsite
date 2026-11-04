"use client";

import {
  ArrowClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MapPinIcon,
  StarIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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

import { BookingSheet, type SheetState, SwipeHint } from "./BookingSheet";
import { DateText } from "./DateText";
import { Duration } from "./Duration";
import { HdrPlate } from "./HdrPlate";
import { Pop, Reveal } from "./Reveal";
import { SpokenTimes } from "./SpokenTimes";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { WeekStrip } from "./WeekStrip";
import { confettiFrom } from "./confetti";
import { tick } from "./haptics";
import styles from "./meet.module.css";

const noSubscription = () => () => undefined;

const PressButton = motion.create(Button);
/** A pressed button's grow and its settle back: quick, with iOS's bounce. */
const PRESS = { type: "spring" as const, duration: 0.35, bounce: 0.5 };

/** Below Tailwind's `md`, where the grid shows a phone's few Days. */
const PHONE_QUERY = "(max-width: 767.98px)";

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
  const { host } = initial.link;
  const { firstDay, lastDay } = initial;

  const [selected, setSelected] = useState<Selected | null>(() =>
    firstBest(initial),
  );
  const reducedMotion = useReducedMotion();
  // The Book button under a finger: grown, and HDR-bright on a screen that can.
  const [pressed, setPressed] = useState(false);
  // Days after the first bookable one: a week steps by 7, a phone by 3. It
  // opens on the Days holding the first best time.
  const [offset, setOffset] = useState(() => {
    const first = selected ? daysBetween(firstDay, selected.day.day) : 0;
    return first < PHONE_DAYS ? 0 : first - (first % PHONE_DAYS);
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
  const days = shown(WEEK);
  const phoneDays = shown(PHONE_DAYS);
  // A Day whose block hasn't come back yet, among the shown Days and the
  // phone's Days a swipe brings in on either side; a read block that left a
  // Day out has nothing open on it.
  const pending = new Set(
    shownDates(WEEK + 2 * PHONE_DAYS, offset - PHONE_DAYS).filter(
      (day) => readFor(day)?.data === undefined,
    ),
  );
  // The blocks holding the shown Days, for a read that failed or closed.
  const shownReads = [...new Set(shownDates(WEEK).map(readFor))].filter(
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
  const [booked, setBooked] = useState<{
    booked: Booked;
    email: string;
  } | null>(null);
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
  // The page's arrival plays once; after it, Days that come in or step
  // arrive their own way. See data-entering in meet.module.css.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        document.querySelector(".meet-root")?.removeAttribute("data-entering"),
      1600,
    );
    return () => clearTimeout(timer);
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

  const select = (start: number) => {
    const day = dayHolding(loaded, start);
    if (!day) return;
    // A tick under the finger for a new time; outside a tap it does nothing.
    if (start !== selected?.start) tick();
    setSelected({ start, day });
    setFailure(null);
    setSheet((at) => (at === "closed" ? "peek" : at));
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

  const slot =
    selection === null
      ? null
      : slotText(selection, selection + length * MINUTE, hostZone, bookerZone);
  const announcement = slot
    ? `${slotSentence(slot, host)}${best ? ", best" : ""}.`
    : "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selection === null || book.isPending) return;
    const button = event.currentTarget.querySelector<HTMLElement>(
      "button[type=submit]",
    );
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
      if (button) confettiFrom(button.getBoundingClientRect());
      attempt.current = null;
      setSheet("closed");
      setBooked({ booked: answer.booked, email: request.email });
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

  const reset = () => {
    setBooked(null);
    setSelected(null);
    setFields((f) => ({ ...f, about: "" }));
    setFailure(null);
  };

  if (booked) {
    return (
      <Confirmation
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
  const weekNav = (
    <DayNav
      unit="week"
      shown={days}
      offset={offset}
      canEarlier={canGo(-WEEK)}
      canLater={canGo(WEEK)}
      onStep={(direction) => go(direction * WEEK)}
      onReturn={() => go(-offset)}
    />
  );
  const daysNav = (
    <DayNav
      unit="days"
      shown={phoneDays}
      offset={offset}
      canEarlier={canGo(-PHONE_DAYS)}
      canLater={canGo(PHONE_DAYS)}
      onStep={(direction) => go(direction * PHONE_DAYS)}
      onReturn={() => go(-offset)}
    />
  );
  const needsToken = Boolean(turnstileSiteKey);
  const canBook =
    selection !== null && !book.isPending && (!needsToken || token !== null);
  const CallIcon = link.call.kind === "place" ? MapPinIcon : VideoCameraIcon;

  const form = (
    <form
      onSubmit={(event) => void submit(event)}
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
                "flex items-center justify-between gap-2 text-[19px] font-semibold tracking-[-0.01em]",
                phone && "leading-tight",
              )}
            >
              <span className="min-w-0 truncate">
                <DateText text={slot.booker.day} rolls />
                <Reveal
                  show={!!until?.day}
                  className={cn(styles.secondary, styles.aside, "font-medium")}
                >
                  <span className={styles.dot}> · </span>
                  <SwapText text={until?.day ?? ""} />
                </Reveal>
              </span>
              <Pop show={best} className={styles.capsule}>
                <StarIcon aria-hidden weight="fill" size={10} />
                Best
              </Pop>
            </p>
            <p
              className={cn(
                "text-[17px] font-semibold tabular-nums",
                phone && "mt-0.5 leading-tight",
              )}
            >
              <DateText text={slot.booker.short.start} rolls />
              <span className={styles.dash}>-</span>
              <DateText text={slot.booker.short.end} rolls />{" "}
              {/* The zone at the size of the "in 4h" after it. */}
              <span className={cn(styles.secondary, styles.aside)}>
                {slot.booker.zone}
                <Reveal show={!!until?.time} className="font-medium">
                  <span className={styles.dot}> · </span>
                  <DateText text={until?.time ?? ""} rolls />
                </Reveal>
              </span>
            </p>
            {!slot.sameClock && (
              <p className={cn(styles.secondary, "text-[13px] tabular-nums")}>
                <DateText
                  rolls
                  text={`${shortClock(selection!, hostZone)} ${slot.host.zone} for ${host}${slot.dateDiffers ? `, ${slot.host.day}` : ""}`}
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

      <p
        className={cn(styles.secondary, "flex items-center gap-2 text-[13px]")}
      >
        <CallIcon size={16} aria-hidden />
        {callLabel(link.call)}
      </p>

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

      <div className={cn(phone && styles.sheetDock, "space-y-4")}>
        {/* Pressed, it grows on a spring and its blue goes brighter than
            white, as iOS's own buttons light up under a finger. */}
        <PressButton
          type="submit"
          disabled={!canBook}
          className={cn(styles.primary, "relative w-full")}
          data-pressed={pressed || undefined}
          whileTap={reducedMotion ? undefined : { scale: 1.04 }}
          transition={PRESS}
          onTapStart={() => {
            setPressed(true);
            tick();
          }}
          onTap={() => setPressed(false)}
          onTapCancel={() => setPressed(false)}
        >
          <HdrPlate className={styles.pressPlate} />
          <span className="relative">
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
          </span>
        </PressButton>
        {needsToken &&
          token === null &&
          selection !== null &&
          !book.isPending && (
            <p className={cn(styles.secondary, "text-center text-xs")}>
              Checking you&apos;re a person...
            </p>
          )}
      </div>
    </form>
  );

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="min-w-0 space-y-5">
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
                <div className="ml-auto hidden md:block">{weekNav}</div>
                <div className="ml-auto md:hidden">{daysNav}</div>
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
            <div className="hidden md:block">
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
                onPastEdge={pastEdge(WEEK)}
                nav={weekNav}
              />
            </div>
            <div className="md:hidden">
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
                onStep={(direction) => go(direction * PHONE_DAYS)}
                onPastEdge={pastEdge(PHONE_DAYS)}
                nav={daysNav}
                canStep={{
                  earlier: canGo(-PHONE_DAYS),
                  later: canGo(PHONE_DAYS),
                }}
                peek={{
                  earlier: canGo(-PHONE_DAYS)
                    ? shown(PHONE_DAYS, Math.max(0, offset - PHONE_DAYS))
                    : undefined,
                  later: canGo(PHONE_DAYS)
                    ? shown(PHONE_DAYS, offset + PHONE_DAYS)
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
        <BookingSheet state={sheet} onState={setSheet} label="Your booking">
          {form}
        </BookingSheet>
      ) : (
        <aside
          data-enter
          style={{ ["--enter" as string]: 5 }}
          aria-label="Your booking"
          className="w-full max-md:hidden md:max-w-md lg:sticky lg:top-6 lg:self-start"
        >
          {form}
        </aside>
      )}
    </div>
  );
}

/** The arrows and the range they step: a week on a computer, 3 Days on a
 * phone. Away from the first, a dot before them goes back to it. */
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
      <Pop show={away} className={styles.navReturn}>
        <button
          type="button"
          aria-label={unit === "week" ? "Back to this week" : "Back to today"}
          onClick={onReturn}
          className="grid size-full place-items-center rounded-[inherit] outline-none"
        >
          <span aria-hidden className={styles.navReturnDot} />
        </button>
      </Pop>
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
        for a screen reader, which can't glance at the columns. */}
      <span className="px-1 text-center text-[15px] font-semibold tabular-nums">
        <SwapText text={stepLabel(offset, shown.length)} />
        {shown.length > 0 && (
          <span className="sr-only">
            , {rangeLabel(shown[0]!.day, shown.at(-1)!.day)}
          </span>
        )}
      </span>
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

function Confirmation({
  booked,
  email,
  host,
  hostZone,
  bookerZone,
  call,
  headingRef,
  onAnother,
}: {
  booked: Booked;
  email: string;
  host: string;
  hostZone: string;
  bookerZone: string;
  call: BookingPage["link"]["call"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAnother: () => void;
}) {
  const slot = slotText(booked.start, booked.end, hostZone, bookerZone);
  return (
    <section
      className={cn(
        styles.card,
        "mx-auto max-w-md px-6 py-8 text-center sm:px-8",
      )}
    >
      <CheckCircleIcon
        size={40}
        weight="fill"
        className={cn(styles.check, "mx-auto")}
        aria-hidden
      />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-[22px] font-bold tracking-[-0.015em] outline-none"
      >
        You&apos;re meeting {host}
      </h2>
      <p className="mt-4 text-[17px] font-semibold">
        <DateText text={slot.booker.day} />
      </p>
      <p className="text-[15px] font-semibold tabular-nums">
        <DateText text={slot.booker.short.start} />
        <span className={styles.dash}>-</span>
        <DateText text={slot.booker.short.end} />{" "}
        <span className={styles.secondary}>{slot.booker.zone}, your time</span>
      </p>
      {!slot.sameClock && (
        <p className={cn(styles.secondary, "mt-1 text-[13px] tabular-nums")}>
          <DateText text={slot.host.short.start} />
          <span className={styles.dash}>-</span>
          <DateText text={slot.host.short.end} /> {slot.host.zone} for {host}
          {slot.dateDiffers && `, ${slot.host.day}`}
        </p>
      )}
      <p className="mt-6 text-sm">
        The invite is in your inbox at{" "}
        <span className="font-semibold">{email}</span>
        {call.kind === "meet"
          ? ", with the Google Meet link."
          : call.kind === "place"
            ? `, at ${call.location ?? "the place"}.`
            : ", with the call link."}
      </p>
      <p className={cn(styles.secondary, "mt-1 text-[13px]")}>{booked.title}</p>
      <Button
        type="button"
        onClick={onAnother}
        className={cn(styles.quiet, "mt-8 px-4")}
      >
        Book another time
      </Button>
    </section>
  );
}
