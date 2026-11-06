import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { meetPath } from "~/lib/booking/meetRoutes";
import { DEFAULT_SLUG, callLabel } from "~/lib/booking/page";
import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";

import { Duration } from "./Duration";
import { MeetBooking } from "./MeetBooking";
import { MeetDust } from "./MeetDust";
import { HomeAction, MeetMessage } from "./MeetMessage";
import { MeetThemeColor } from "./MeetThemeColor";
import { MeetTitle } from "./MeetTitle";
import { PortraitRing } from "./PortraitRing";
import { forceReload, introScript } from "./intro";
import styles from "./meet.module.css";
import { onlyLength } from "./metadata";
import { readMeet } from "./read";
import { STICKY_HEADER } from "./sticky";
import { env } from "~/env";

/**
 * One Booking link's page. /meet says when booking is closed; any other
 * link that's closed or unknown is a 404, so a stranger can't tell an old
 * private link from one that never was.
 */
export async function MeetScreen({ slug }: { slug: string }) {
  const read = await readMeet(slug);
  if (read.status === "closed" && slug !== DEFAULT_SLUG) notFound();
  if (read.status === "unavailable")
    return (
      <MeetMessage
        heading="The calendar didn't answer."
        actions={
          <>
            {/* A plain link, so the page reads the calendar again. */}
            <Button asChild className={styles.primary}>
              <a href={meetPath(slug)}>Try again</a>
            </Button>
            <HomeAction />
          </>
        }
      >
        It&apos;s usually brief, so try again in a minute.
      </MeetMessage>
    );
  if (read.status === "closed")
    return (
      <MeetMessage
        heading="Booking isn't open right now."
        actions={
          <>
            <Button asChild className={styles.primary}>
              <a href="mailto:chappyasel@gmail.com">Email Chappy</a>
            </Button>
            <HomeAction />
          </>
        }
      >
        No times are open to book. Check back soon, or send an email instead.
      </MeetMessage>
    );
  const { page } = read;
  const title = page.link.title;
  const length = onlyLength(page.link);

  return (
    // Its script marks the long entrance before the first paint, and
    // MeetTitle starts whichever entrance once hydrated (intro.ts).
    <div className="meet-root" data-entering="wait" suppressHydrationWarning>
      <script
        dangerouslySetInnerHTML={{
          __html: introScript(forceReload(await headers())),
        }}
      />
      <MeetThemeColor />
      <MeetDust />
      <PortraitRing />
      {STICKY_HEADER && <div aria-hidden className={styles.statusFade} />}
      <main className={styles.main}>
        {/* On a phone, centred over the Days, as the grid's nav is: the
          rail's 2.5rem in, less the 0.75rem the grid reaches into the
          gutter. Beside the card, in line with the first Day's heading:
          the rail's 3.25rem and the heading's 0.5rem inset in, with the
          photo over the rail. */}
        <header
          className={cn(
            styles.titleHead,
            "relative mb-2 max-[871.98px]:pl-[1.75rem] max-[871.98px]:text-center min-[872px]:mb-5 min-[872px]:pl-[3.75rem]",
          )}
        >
          <MeetTitle title={title} />
          {/* A phone's booking card says the same, so it's left out there. */}
          <p
            data-enter
            style={{ ["--enter" as string]: 1 }}
            className={cn(styles.facts, "max-[871.98px]:hidden")}
          >
            {length !== null && (
              <>
                <Duration minutes={length} />
                <span aria-hidden> · </span>
              </>
            )}
            {callLabel(page.link.call)}
          </p>
        </header>

        <section aria-label="Pick a time">
          <MeetBooking
            slug={slug}
            initial={page}
            turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </section>
      </main>
    </div>
  );
}
