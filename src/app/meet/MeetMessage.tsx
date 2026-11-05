import Image from "next/image";
import Link from "next/link";
import portrait from "public/images/about/profile.jpg";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";

import { MeetThemeColor } from "./MeetThemeColor";
import styles from "./meet.module.css";

/**
 * A /meet page with no schedule to show, such as a link that isn't open,
 * a calendar that didn't answer, or an error, in the booking page's own
 * look: Chappy's photo and the title over an empty week that fades into
 * the page, what happened, and a way on.
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
        <div aria-hidden className={styles.emptyWeek} />
        <div className={styles.messageBody}>
          <Image
            src={portrait}
            alt=""
            width={72}
            height={72}
            priority
            data-enter
            style={{ ["--enter" as string]: 0 }}
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
    <Button asChild className={styles.quiet}>
      <Link href="/">chappyasel.com</Link>
    </Button>
  );
}
