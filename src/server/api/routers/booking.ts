import { z } from "zod";

import { DAY_PATTERN, SLUG_PATTERN } from "~/lib/booking/page";
import { REQUEST_ID } from "~/lib/booking/request";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  bookingConfig,
  clientIpFrom,
  readBookingPage,
  submitBooking,
} from "~/server/booking/daybreak";

import { env } from "~/env";

/**
 * /meet's two calls, proxied to the Daybreak deployment so the browser
 * never reaches it or its secrets. Both answer plain results rather than
 * throwing, so the page can tell a taken time from a dropped connection.
 */
export const bookingRouter = createTRPCRouter({
  /** `READ_DAYS` of a Booking link's open time from `from`, or from its first bookable Day. */
  page: publicProcedure
    .input(
      z.object({
        slug: z.string().regex(SLUG_PATTERN),
        from: z.string().regex(DAY_PATTERN).optional(),
      }),
    )
    .query(({ input: { slug, from } }) =>
      readBookingPage(bookingConfig(env, slug), { from }),
    ),

  /** Books a time, after Cloudflare Turnstile. Daybreak checks every field again. */
  book: publicProcedure
    .input(
      z.object({
        slug: z.string().regex(SLUG_PATTERN),
        start: z.number().finite(),
        length: z
          .number()
          .positive()
          .max(24 * 60),
        name: z.string().max(200),
        email: z.string().max(320),
        about: z.string().max(200).optional(),
        linkedin: z.string().max(400).optional(),
        requestId: z.string().regex(REQUEST_ID),
        turnstileToken: z.string().max(4096).optional(),
      }),
    )
    .mutation(({ ctx, input: { slug, ...request } }) =>
      submitBooking(
        bookingConfig(env, slug),
        request,
        clientIpFrom(ctx.headers),
      ),
    ),
});
