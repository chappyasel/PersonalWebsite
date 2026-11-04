"use client";

import {
  ArrowClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  MapPinIcon,
  SunIcon,
  VideoCameraIcon,
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
  callLabel,
  lengthLabel,
  weekStart,
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
  zonedParts,
} from "~/lib/booking/zones";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

import { TimeList } from "./TimeList";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { WeekStrip } from "./WeekStrip";
import styles from "./meet.module.css";

const noSubscription = () => () => undefined;

/** The browser's zone after hydration; null while the server renders. */
function useBookerZone() {
  return useSyncExternalStore(noSubscription, browserTimeZone, () => null);
}

type Selected = { start: number; day: BookingDay };

type Fields = { name: string; email: string; about: string; linkedin: string };

const EMPTY: Fields = { name: "", email: "", about: "", linkedin: "" };

export function MeetBooking({
  initial,
  turnstileSiteKey,
}: {
  initial: BookingPage;
  turnstileSiteKey?: string;
}) {
  const hostZone = initial.timeZone;
  const bookerZone = useBookerZone() ?? hostZone;
  const { host } = initial.link;

  const [week, setWeek] = useState(0);
  const from =
    weekStart(initial.firstDay, initial.lastDay, week) ?? initial.firstDay;
  const query = api.booking.page.useQuery(
    { from },
    {
      initialData:
        week === 0 ? { status: "open" as const, page: initial } : undefined,
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
  const [phoneDay, setPhoneDay] = useState<string | null>(null);
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
    setPhoneDay(day.day);
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

  const slot =
    selection === null
      ? null
      : slotText(selection, selection + length * MINUTE, hostZone, bookerZone);
  const announcement = slot
    ? `${slotSentence(slot, host)}${suggestions.includes(selection!) ? `, a best time for ${host}` : ""}.`
    : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (selection === null || book.isPending) return;
    const request = {
      start: selection,
      length,
      name: fields.name.trim(),
      email: fields.email.trim(),
      about: fields.about.trim(),
      ...(fields.linkedin.trim() ? { linkedin: fields.linkedin.trim() } : {}),
    };
    attempt.current = attemptFor(attempt.current, attemptKey(request));
    let answer: BookResult;
    try {
      answer = await book.mutateAsync({
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

  const previous = weekStart(initial.firstDay, initial.lastDay, week - 1);
  const next = weekStart(initial.firstDay, initial.lastDay, week + 1);
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
          <div
            role="group"
            aria-label="Length"
            className="flex flex-wrap gap-1.5"
          >
            {link.lengths.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={option === length ? "default" : "outline"}
                aria-pressed={option === length}
                onClick={() => pickLength(option)}
                className="tabular-nums"
              >
                {lengthLabel(option)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Earlier week"
              disabled={previous === null}
              onClick={() => setWeek((w) => w - 1)}
            >
              <CaretLeftIcon aria-hidden />
            </Button>
            <span className="min-w-28 text-center text-sm font-medium tabular-nums">
              {days.length > 0
                ? rangeLabel(days[0]!.day, days.at(-1)!.day)
                : ""}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Later week"
              disabled={next === null}
              onClick={() => setWeek((w) => w + 1)}
            >
              <CaretRightIcon aria-hidden />
            </Button>
          </div>
        </div>

        {failure && recoveryFor(failure.code) === "repick" && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {failure.message}
          </p>
        )}

        {read?.status === "unavailable" ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            Couldn&apos;t load these days.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              <ArrowClockwiseIcon aria-hidden />
              Try again
            </Button>
          </div>
        ) : read?.status === "closed" ? (
          <p className="py-10 text-sm text-muted-foreground">
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
              <TimeList
                days={days}
                activeDay={phoneDay}
                hostZone={hostZone}
                bookerZone={bookerZone}
                host={host}
                length={length}
                selection={selection}
                suggestions={suggestions}
                onDay={setPhoneDay}
                onSelect={select}
              />
            </div>
            {suggestions.length > 0 && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <SunIcon
                  size={13}
                  weight="fill"
                  className="text-[hsl(var(--dl-am))]"
                  aria-hidden
                />
                A sun marks the times that suit {host} best. They sit against
                other meetings, so longer stretches stay free.
              </p>
            )}
          </div>
        )}
      </div>

      <aside
        aria-label="Your booking"
        className="lg:sticky lg:top-6 lg:self-start"
      >
        <form
          onSubmit={(event) => void submit(event)}
          className="space-y-4 rounded-xl border bg-card/80 p-5 font-sans shadow-sm backdrop-blur"
        >
          <div className="min-h-[4.5rem]">
            {slot ? (
              <>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {lengthLabel(length)}
                  {suggestions.includes(selection!) && (
                    <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-[hsl(var(--dl-am))]">
                      <SunIcon size={12} weight="fill" aria-hidden />
                      Best for {host}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-lg font-semibold">{slot.booker.day}</p>
                <p className="text-base font-medium tabular-nums">
                  {slot.booker.start} - {slot.booker.end}{" "}
                  <span className="text-muted-foreground">
                    {slot.booker.zone}
                  </span>
                </p>
                {!slot.sameClock && (
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {slot.host.start} {slot.host.zone} for {host}
                    {slot.dateDiffers && `, ${slot.host.day}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick a length and a time. Every time shows in your zone and{" "}
                {host}&apos;s.
              </p>
            )}
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
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
              />
            </Field>
            <Field
              label="What it's about"
              id="meet-about"
              hint="One line. It titles the invite."
            >
              <Input
                id="meet-about"
                required
                maxLength={200}
                value={fields.about}
                onChange={(e) =>
                  setFields({ ...fields, about: e.target.value })
                }
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
            <p role="alert" className="text-sm font-medium text-destructive">
              {failure.message}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canBook}>
            {book.isPending
              ? "Booking..."
              : failure && recoveryFor(failure.code) === "retry"
                ? "Try again"
                : selection === null
                  ? "Pick a time first"
                  : `Book ${lengthLabel(length)}`}
          </Button>
          {needsToken &&
            token === null &&
            selection !== null &&
            !book.isPending && (
              <p className="text-center text-xs text-muted-foreground">
                Checking you&apos;re a person...
              </p>
            )}
        </form>
      </aside>
    </div>
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
        className="flex items-baseline justify-between text-sm font-medium"
      >
        {label}
        {optional && (
          <span className="text-xs font-normal text-muted-foreground">
            Optional
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  const light = zonedParts(booked.start, bookerZone).hour < 12 ? "am" : "pm";
  return (
    <section
      data-light={light}
      className={cn(
        styles.postcard,
        "mx-auto max-w-xl rounded-2xl border bg-card/70 px-6 py-8 font-sans shadow-sm sm:px-10",
      )}
    >
      <CheckCircleIcon
        size={32}
        weight="duotone"
        className="text-[hsl(var(--dl-ic-moss))]"
        aria-hidden
      />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-2xl font-semibold outline-none"
      >
        You&apos;re meeting {host}
      </h2>
      <p className="mt-4 text-lg font-medium">{slot.booker.day}</p>
      <p className="text-lg tabular-nums">
        {slot.booker.start} - {slot.booker.end}{" "}
        <span className="text-muted-foreground">
          your time, {slot.booker.zone}
        </span>
      </p>
      {!slot.sameClock && (
        <p className="mt-1 tabular-nums text-muted-foreground">
          {slot.host.start} - {slot.host.end} {slot.host.zone} for {host}
          {slot.dateDiffers && `, ${slot.host.day}`}
        </p>
      )}
      <p className="mt-6 flex items-start gap-2">
        <EnvelopeSimpleIcon size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          The invite is in your inbox at{" "}
          <span className="font-medium">{email}</span>
          {call.kind === "meet"
            ? ", with the Google Meet link."
            : call.kind === "place"
              ? `, at ${call.location ?? "the place"}.`
              : ", with the call link."}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{booked.title}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-8"
        onClick={onAnother}
      >
        Book another time
      </Button>
    </section>
  );
}
