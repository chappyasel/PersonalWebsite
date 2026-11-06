import Image from "next/image";
import portrait from "public/images/about/profile.jpg";
import type { CSSProperties, ReactNode } from "react";

import { MeetThemeColor } from "./MeetThemeColor";
import { PortraitRing } from "./PortraitRing";
import { PressLink } from "./PressButton";
import styles from "./meet.module.css";

/** The ring blooms out of the photo as the photo lands (.messagePortrait). */
const RING_AFTER = 380;

/**
 * Open times that come and go on the empty week behind the words, faint,
 * a few at once, mostly beside the words, where the week hasn't faded
 * into the page yet: a Day's column, the hour it starts at, its length in
 * hours, and when it first shows, in seconds.
 */
const DRIFTING: [day: number, hour: number, hours: number, at: number][] = [
  [1, 1, 1, 0],
  [5, 2, 1.5, 0.9],
  [4, 6.5, 1, 2],
  [1, 4, 1.5, 3],
  [5, 5, 1, 4.1],
  [2, 0.5, 1, 5.2],
  [6, 3.5, 1, 6.2],
  [1, 6, 1, 7.3],
  [5, 0.5, 1, 8.4],
  [0, 2.5, 1, 9.5],
  [3, 7, 0.5, 10.5],
];

/**
 * A /meet page with no schedule to show, such as a link that isn't open,
 * a calendar that didn't answer, or an error, in the booking page's own
 * look: Chappy's photo in its ring of dust and the title over an empty
 * week that fades into the page, faint open times coming and going on it,
 * what happened, and a way on. It all comes in as the booking page does,
 * the photo popping in first and the ring blooming out of it.
 */
export function MeetMessage({
  title = "Meet with Chappy",
  heading,
  children,
  actions,
}: {
  title?: string;
  /** What happened, in a few words. */
  heading: string;
  /** What to do about it. */
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="meet-root" data-entering="">
      <MeetThemeColor />
      <main className={styles.message}>
        <div aria-hidden className={styles.emptyWeek}>
          {DRIFTING.map(([day, hour, hours, at]) => (
            <span
              key={`${day}-${hour}`}
              className={styles.emptyOpen}
              style={
                {
                  "--day": day,
                  "--hour": hour,
                  "--hours": hours,
                  "--at": `${at}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className={styles.messageBody}>
          {/* Its far canvas is ahead of the photo, so the photo draws over
              the far half of the ring. */}
          <PortraitRing
            photo={styles.messagePortrait}
            always
            after={RING_AFTER}
          />
          <Image
            src={portrait}
            alt=""
            width={104}
            height={104}
            priority
            draggable={false}
            data-enter
            className={styles.messagePortrait}
          />
          <h1
            data-enter
            style={{ ["--enter" as string]: 1 }}
            className={styles.title}
          >
            {title}
          </h1>
          <p
            data-enter
            style={{ ["--enter" as string]: 2 }}
            className={styles.messageHead}
          >
            {heading}
          </p>
          <p
            data-enter
            style={{ ["--enter" as string]: 3 }}
            className={styles.messageText}
          >
            {children}
          </p>
          {actions && (
            <div
              data-enter
              style={{ ["--enter" as string]: 4 }}
              className={styles.messageActions}
            >
              {actions}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** The quiet way out, to the rest of the site. */
export function HomeAction() {
  return (
    <PressLink href="/" quiet>
      chappyasel.com
    </PressLink>
  );
}
