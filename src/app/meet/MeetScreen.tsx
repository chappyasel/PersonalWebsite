import { notFound } from "next/navigation";

import { DEFAULT_SLUG, callLabel } from "~/lib/booking/page";
import { cn } from "~/lib/utils";

import { Duration } from "./Duration";
import { MeetBooking } from "./MeetBooking";
import { MeetThemeColor } from "./MeetThemeColor";
import styles from "./meet.module.css";
import { onlyLength } from "./metadata";
import { readMeet } from "./read";
import { env } from "~/env";

/**
 * One Booking link's page. /meet says when booking is closed; any other
 * link that's closed or unknown is a 404, so a stranger can't tell an old
 * private link from one that never was.
 */
export async function MeetScreen({ slug }: { slug: string }) {
  const read = await readMeet(slug);
  if (read.status === "closed" && slug !== DEFAULT_SLUG) notFound();
  const page = read.status === "open" ? read.page : null;
  const title = page?.link.title ?? "Meet with Chappy";
  const length = page ? onlyLength(page.link) : null;

  return (
    <div className="meet-root">
      <MeetThemeColor />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
        <header className="mb-6">
          <h1 className={styles.title}>{title}</h1>
          {page && (
            <p className={styles.facts}>
              {length !== null && (
                <>
                  <Duration minutes={length} />
                  <span aria-hidden> · </span>
                </>
              )}
              {callLabel(page.link.call)}
            </p>
          )}
          <p className={cn(styles.lede, page && "mt-1")}>
            {page
              ? `${length === null ? "Pick a length and a time" : "Pick a time"}. Times show in your zone and ${page.link.host}'s.`
              : read.status === "unavailable"
                ? "The calendar didn't answer. Try again in a minute."
                : "Booking isn't open right now."}
          </p>
        </header>

        {page && (
          <section aria-label="Pick a time">
            <MeetBooking
              slug={slug}
              initial={page}
              turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          </section>
        )}
      </main>
    </div>
  );
}
