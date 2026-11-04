import { cache } from "react";
import "server-only";

import { bookingConfig, readBookingPage } from "~/server/booking/daybreak";

import { env } from "~/env";

/**
 * A Booking link's first week, read once per request: the page, its
 * metadata, and its share image all ask for the same link.
 */
export const readMeet = cache((slug: string) =>
  readBookingPage(bookingConfig(env, slug), {}),
);
