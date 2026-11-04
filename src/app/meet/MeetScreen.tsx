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
    <div className="meet-root" data-entering="">
      <MeetThemeColor />
      <main className={styles.main}>
        <header className="mb-2">
          <h1
            data-enter
            style={{ ["--enter" as string]: 0 }}
            className={styles.title}
          >
            {title}
          </h1>
          {/* A phone's booking card says the same, so it's left out there. */}
          {page && (
            <p
              data-enter
              style={{ ["--enter" as string]: 1 }}
              className={cn(styles.facts, "max-md:hidden")}
            >
              {length !== null && (
                <>
                  <Duration minutes={length} />
                  <span aria-hidden> · </span>
                </>
              )}
              {callLabel(page.link.call)}
            </p>
          )}
          {!page && (
            <p
              data-enter
              style={{ ["--enter" as string]: 1 }}
              className={styles.lede}
            >
              {read.status === "unavailable"
                ? "The calendar didn't answer. Try again in a minute."
                : "Booking isn't open right now."}
            </p>
          )}
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
