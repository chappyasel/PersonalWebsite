import { CalendarCheckIcon } from "@phosphor-icons/react/dist/ssr";

import { bookingConfig, readBookingPage } from "~/server/booking/daybreak";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyFooter from "~/components/daylight/SkyFooter";
import SkyHero from "~/components/daylight/SkyHero";

import { MeetBooking } from "./MeetBooking";
import { env } from "~/env";

// Open time changes as the calendar does; the proxy caches reads for 30 s.
export const dynamic = "force-dynamic";

export default async function MeetPage() {
  const read = await readBookingPage(bookingConfig(env), {});
  const page = read.status === "open" ? read.page : null;
  const title = page?.link.title ?? "Meet with Chappy";

  return (
    <div className="daylight-root dl-ground-arc min-h-screen bg-background text-foreground">
      <main className="relative">
        <SkyHero>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CalendarCheckIcon
                size={28}
                weight="duotone"
                className="shrink-0 text-[hsl(var(--dl-sky-ink))]"
                aria-hidden
              />
              <h1 className="dl-hero-title">{title}</h1>
            </div>
            <div className="dl-prose">
              {page ? (
                <p>
                  Pick how long, then a time. Open hours are green. A sun marks
                  the times that suit {page.link.host} best: next to other
                  meetings or at the edge of open time, so longer stretches stay
                  free. Book it and the invite lands in your inbox.
                </p>
              ) : (
                <p>
                  {read.status === "unavailable"
                    ? "The calendar didn't answer. Try again in a minute."
                    : "Booking isn't open right now."}
                </p>
              )}
            </div>
            <DaylightHeroMeta />
          </div>
        </SkyHero>

        {page && (
          <section
            aria-label="Pick a time"
            className="mx-auto mt-10 max-w-6xl px-4 pb-16"
          >
            <MeetBooking
              initial={page}
              turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          </section>
        )}
        <SkyFooter />
      </main>
    </div>
  );
}
