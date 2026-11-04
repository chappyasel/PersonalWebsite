import { z } from "zod";

import { DAY_PATTERN } from "~/lib/booking/page";
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
  /** A week of the Booking link's open time from `from`, or from its first bookable Day. */
  page: publicProcedure
    .input(z.object({ from: z.string().regex(DAY_PATTERN).optional() }))
    .query(({ input }) => readBookingPage(bookingConfig(env), input)),

  /** Books a time, after Cloudflare Turnstile. Daybreak checks every field again. */
  book: publicProcedure
    .input(
      z.object({
        start: z.number().finite(),
        length: z
          .number()
          .positive()
          .max(24 * 60),
        name: z.string().max(200),
        email: z.string().max(320),
        about: z.string().max(400),
        linkedin: z.string().max(400).optional(),
        requestId: z.string().regex(REQUEST_ID),
        turnstileToken: z.string().max(4096).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      submitBooking(bookingConfig(env), input, clientIpFrom(ctx.headers)),
    ),
});
