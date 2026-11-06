"use client";

import type { BookingPage } from "~/lib/booking/page";
import type { Booked } from "~/lib/booking/request";
import { type SlotText, slotText } from "~/lib/booking/zones";

import { ConfirmTicket } from "./ConfirmTicket";

/**
 * The screen after a booking lands: Pass, a ticket that prints out of a
 * slot of dust with a ring of it orbiting round (ConfirmTicket). The Owner
 * chose it on November 5, 2026, from three directions; the other two,
 * Gather and Sand, went, and Gather's dust became the page's intro
 * (MeetDust). /meet/confirmed-preview shows it without booking.
 */
export type ConfirmationProps = {
  booked: Booked;
  email: string;
  host: string;
  hostZone: string;
  bookerZone: string;
  call: BookingPage["link"]["call"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAnother: () => void;
  /** Where the dust comes from, in page coordinates: the Book button. */
  from?: { x: number; y: number } | null;
};

export type VariantProps = ConfirmationProps & { slot: SlotText };

export function Confirmation(props: ConfirmationProps) {
  const slot = slotText(
    props.booked.start,
    props.booked.end,
    props.hostZone,
    props.bookerZone,
  );
  return <ConfirmTicket {...props} slot={slot} />;
}

/** "with the Google Meet link." and its kin, after the email. */
export function callTail(call: BookingPage["link"]["call"]) {
  return call.kind === "meet"
    ? ", with the Google Meet link."
    : call.kind === "place"
      ? `, at ${call.location ?? "the place"}.`
      : ", with the call link.";
}

/** The date's parts on the booker's clock, for big type. */
export function dateParts(start: number, timeZone: string) {
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...o }).format(start);
  return {
    weekday: part({ weekday: "long" }),
    month: part({ month: "long" }),
    day: part({ day: "numeric" }),
  };
}
