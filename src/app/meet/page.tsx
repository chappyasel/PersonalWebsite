import { bookingConfig, readBookingPage } from "~/server/booking/daybreak";

import { MeetBooking } from "./MeetBooking";
import styles from "./meet.module.css";
import { env } from "~/env";

// Open time changes as the calendar does; the proxy caches reads for 30 s.
export const dynamic = "force-dynamic";

export default async function MeetPage() {
  const read = await readBookingPage(bookingConfig(env), {});
  const page = read.status === "open" ? read.page : null;
  const title = page?.link.title ?? "Meet with Chappy";

  return (
    <div className="meet-root">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
        <header className="mb-6">
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>
            {page
              ? `Pick a length and a time. Times show in your zone and ${page.link.host}'s.`
              : read.status === "unavailable"
                ? "The calendar didn't answer. Try again in a minute."
                : "Booking isn't open right now."}
          </p>
        </header>

        {page && (
          <section aria-label="Pick a time">
            <MeetBooking
              initial={page}
              turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          </section>
        )}
      </main>
    </div>
  );
}
