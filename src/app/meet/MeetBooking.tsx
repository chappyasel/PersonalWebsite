"use client";

import {
  ArrowClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MapPinIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type BookingDay,
  type BookingPage,
  PHONE_DAYS,
  WEEK,
  callLabel,
  windowStart,
} from "~/lib/booking/page";
import {
  type Attempt,
  type BookResult,
  type Booked,
  MESSAGES,
  attemptFor,
  attemptKey,
  recoveryFor,
} from "~/lib/booking/request";
import { MINUTE, dayHolding, resize, suggestedFor } from "~/lib/booking/slots";
import {
  browserTimeZone,
  rangeLabel,
  slotSentence,
  slotText,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { Duration } from "./Duration";
import { SpokenTimes } from "./SpokenTimes";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { WeekStrip } from "./WeekStrip";
import styles from "./meet.module.css";

const noSubscription = () => () => undefined;

/** Below Tailwind's `md`, where the grid shows a phone's few Days. */
function isPhone(): boolean {
  return window.matchMedia?.("(max-width: 767.98px)").matches ?? false;
}

/** The browser's zone after hydration; null while the server renders. */
function useBookerZone() {
  return useSyncExternalStore(noSubscription, browserTimeZone, () => null);
}

type Selected = { start: number; day: BookingDay };

type Fields = { name: string; email: string; about: string; linkedin: string };

const EMPTY: Fields = { name: "", email: "", about: "", linkedin: "" };

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
  const { host } = initial.link;

  // Days after the first bookable one: a week steps by 7, a phone by 3.
  const [offset, setOffset] = useState(0);
  const from =
    windowStart(initial.firstDay, initial.lastDay, offset) ?? initial.firstDay;
  const query = api.booking.page.useQuery(
    { slug, from },
    {
      initialData:
        offset === 0 ? { status: "open" as const, page: initial } : undefined,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    },
  );
  const utils = api.useUtils();
  const read = query.data;
  const page = read?.status === "open" ? read.page : null;
  const days = page?.days ?? [];
  const link = page?.link ?? initial.link;

  const [length, setLength] = useState(initial.link.defaultLength);
  const [selected, setSelected] = useState<Selected | null>(null);
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
  const attempt = useRef<Attempt | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);
  const bookedHeading = useRef<HTMLHeadingElement>(null);
  const book = api.booking.book.useMutation();

  const suggestions = page
    ? suggestedFor(page.days, page.suggested, page.link.defaultLength, length)
    : [];
  const selection = selected?.start ?? null;

  const select = (start: number) => {
    const day = dayHolding(days, start);
    if (!day) return;
    setSelected({ start, day });
    setFailure(null);
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

  // A phone swipes 3 Days either way; read them ahead so they slide in full.
  useEffect(() => {
    if (!isPhone()) return;
    for (const by of [PHONE_DAYS, -PHONE_DAYS]) {
      const near = windowStart(initial.firstDay, initial.lastDay, offset + by);
      if (near) void utils.booking.page.prefetch({ slug, from: near });
    }
  }, [utils, slug, offset, initial.firstDay, initial.lastDay]);

  /** On a phone the card is below the grid, so a tap brings it up. */
  const showCard = () => {
    if (!isPhone()) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.current?.scrollIntoView({
      behavior: still ? "auto" : "smooth",
      block: "start",
    });
  };

  const slot =
    selection === null
      ? null
      : slotText(selection, selection + length * MINUTE, hostZone, bookerZone);
  const announcement = slot
    ? `${slotSentence(slot, host)}${suggestions.includes(selection!) ? ", best" : ""}.`
    : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (selection === null || book.isPending) return;
    const request = {
      start: selection,
      length,
      name: fields.name.trim(),
      email: fields.email.trim(),
      ...(fields.about.trim() ? { about: fields.about.trim() } : {}),
      ...(fields.linkedin.trim() ? { linkedin: fields.linkedin.trim() } : {}),
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
      attempt.current = null;
      setBooked({ booked: answer.booked, email: request.email });
      void utils.booking.page.invalidate();
      return;
    }
    setFailure(answer);
    if (recoveryFor(answer.code) === "repick") {
      attempt.current = null;
      setSelected(null);
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
    by < 0
      ? offset > 0
      : windowStart(initial.firstDay, initial.lastDay, offset + by) !== null;
  const go = (by: number) => setOffset((o) => Math.max(0, o + by));
  const phoneDays = days.slice(0, PHONE_DAYS);
  const needsToken = Boolean(turnstileSiteKey);
  const canBook =
    selection !== null && !book.isPending && (!needsToken || token !== null);
  const CallIcon = link.call.kind === "place" ? MapPinIcon : VideoCameraIcon;

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {link.lengths.length > 1 && (
            <div role="group" aria-label="Length" className={styles.segmented}>
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
          <DayNav
            className="hidden md:flex"
            unit="week"
            shown={days}
            canEarlier={canGo(-WEEK)}
            canLater={canGo(WEEK)}
            onStep={(direction) => go(direction * WEEK)}
          />
          <DayNav
            className="flex md:hidden"
            unit="days"
            shown={phoneDays}
            canEarlier={canGo(-PHONE_DAYS)}
            canLater={canGo(PHONE_DAYS)}
            onStep={(direction) => go(direction * PHONE_DAYS)}
          />
        </div>

        {failure && recoveryFor(failure.code) === "repick" && (
          <Problem>{failure.message}</Problem>
        )}

        {read?.status === "unavailable" ? (
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
              onClick={() => void query.refetch()}
              className={styles.quiet}
            >
              <ArrowClockwiseIcon aria-hidden />
              Try again
            </Button>
          </div>
        ) : read?.status === "closed" ? (
          <p className={cn(styles.secondary, "py-10 text-sm")}>
            {MESSAGES.closed}
          </p>
        ) : (
          <div
            aria-busy={query.isPlaceholderData}
            className={cn(
              "transition-opacity duration-200",
              query.isPlaceholderData && "opacity-50",
            )}
          >
            <div className="hidden md:block">
              <WeekStrip
                days={days}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onSelect={select}
                onConfirm={() => nameField.current?.focus()}
              />
            </div>
            <div className="md:hidden">
              <WeekStrip
                compact
                days={phoneDays}
                boundsDays={days}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onSelect={select}
                onConfirm={() => nameField.current?.focus()}
                onStep={(direction) => go(direction * PHONE_DAYS)}
                canStep={{
                  earlier: canGo(-PHONE_DAYS),
                  later: canGo(PHONE_DAYS),
                }}
                onPicked={showCard}
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
            {suggestions.length > 0 && (
              <p
                className={cn(
                  styles.secondary,
                  "mt-3 flex items-start gap-2 text-xs leading-4",
                )}
              >
                {/* Centred on the first line: (16px line - 6px dot) / 2. */}
                <span aria-hidden className={cn(styles.dot, "mt-[5px]")} />
                <span>
                  Best: next to other meetings or at the edge of open time, so
                  longer stretches stay free.
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      <aside
        ref={card}
        aria-label="Your booking"
        className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start"
      >
        <form
          onSubmit={(event) => void submit(event)}
          className={cn(styles.card, "space-y-4 p-5")}
        >
          <div>
            {slot ? (
              <>
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <Duration minutes={length} />
                  {suggestions.includes(selection!) && (
                    <span className={styles.capsule}>Best</span>
                  )}
                </p>
                <p className="mt-1 text-[17px] font-semibold tracking-[-0.01em]">
                  {slot.booker.day}
                </p>
                <p className="text-[15px] font-semibold tabular-nums">
                  {slot.booker.start} - {slot.booker.end}{" "}
                  <span className={styles.secondary}>{slot.booker.zone}</span>
                </p>
                {!slot.sameClock && (
                  <p
                    className={cn(styles.secondary, "text-[13px] tabular-nums")}
                  >
                    {slot.host.start} {slot.host.zone} for {host}
                    {slot.dateDiffers && `, ${slot.host.day}`}
                  </p>
                )}
              </>
            ) : (
              <p className={cn(styles.secondary, "text-sm")}>
                Pick a time to book it here.
              </p>
            )}
          </div>

          <p
            className={cn(
              styles.secondary,
              "flex items-center gap-2 text-[13px]",
            )}
          >
            <CallIcon size={16} aria-hidden />
            {callLabel(link.call)}
            {link.call.kind !== "place" && ". The link comes with the invite."}
          </p>

          <fieldset disabled={book.isPending} className="space-y-3">
            <Field label="Name" id="meet-name">
              <Input
                ref={nameField}
                id="meet-name"
                required
                maxLength={100}
                autoComplete="name"
                value={fields.name}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
                className={styles.input}
              />
            </Field>
            <Field label="Email" id="meet-email" hint="The invite goes here.">
              <Input
                id="meet-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={fields.email}
                onChange={(e) =>
                  setFields({ ...fields, email: e.target.value })
                }
                className={styles.input}
              />
            </Field>
            <Field
              label="What it's about"
              id="meet-about"
              hint="One line. It goes in the invite."
              optional
            >
              <Input
                id="meet-about"
                maxLength={200}
                value={fields.about}
                onChange={(e) =>
                  setFields({ ...fields, about: e.target.value })
                }
                className={styles.input}
              />
            </Field>
            <Field label="LinkedIn" id="meet-linkedin" optional>
              <Input
                id="meet-linkedin"
                inputMode="url"
                maxLength={200}
                autoComplete="url"
                placeholder="linkedin.com/in/you"
                value={fields.linkedin}
                onChange={(e) =>
                  setFields({ ...fields, linkedin: e.target.value })
                }
                className={styles.input}
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

          <Button
            type="submit"
            disabled={!canBook}
            className={cn(styles.primary, "w-full")}
          >
            {book.isPending ? (
              "Booking..."
            ) : failure && recoveryFor(failure.code) === "retry" ? (
              "Try again"
            ) : selection === null ? (
              "Pick a time first"
            ) : (
              <span>
                Book <Duration minutes={length} />
              </span>
            )}
          </Button>
          {needsToken &&
            token === null &&
            selection !== null &&
            !book.isPending && (
              <p className={cn(styles.secondary, "text-center text-xs")}>
                Checking you&apos;re a person...
              </p>
            )}
        </form>
      </aside>
    </div>
  );
}

/** The arrows and the range they step: a week on a computer, 3 Days on a phone. */
function DayNav({
  className,
  unit,
  shown,
  canEarlier,
  canLater,
  onStep,
}: {
  className: string;
  unit: "week" | "days";
  shown: BookingDay[];
  canEarlier: boolean;
  canLater: boolean;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className={cn("ml-auto items-center gap-1", className)}>
      <button
        type="button"
        aria-label={`Earlier ${unit}`}
        disabled={!canEarlier}
        onClick={() => onStep(-1)}
        className={styles.chevron}
      >
        <CaretLeftIcon size={14} weight="bold" aria-hidden />
      </button>
      <span className="min-w-28 text-center text-[13px] font-semibold tabular-nums">
        {shown.length > 0 ? rangeLabel(shown[0]!.day, shown.at(-1)!.day) : ""}
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
  hint,
  optional,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
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
        {optional && (
          <span className={cn(styles.secondary, "text-xs")}>Optional</span>
        )}
      </label>
      {children}
      {hint && <p className={cn(styles.secondary, "text-xs")}>{hint}</p>}
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
      <p className="mt-4 text-[17px] font-semibold">{slot.booker.day}</p>
      <p className="text-[15px] font-semibold tabular-nums">
        {slot.booker.start} - {slot.booker.end}{" "}
        <span className={styles.secondary}>your time, {slot.booker.zone}</span>
      </p>
      {!slot.sameClock && (
        <p className={cn(styles.secondary, "mt-1 text-[13px] tabular-nums")}>
          {slot.host.start} - {slot.host.end} {slot.host.zone} for {host}
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
