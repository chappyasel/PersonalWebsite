import type { ReactNode } from "react";

import { MeetThemeColor } from "./MeetThemeColor";
import styles from "./meet.module.css";

/**
 * A /meet page with no schedule to show, such as an error or a link that
 * isn't open, in the booking page's own look rather than the site's.
 */
export function MeetMessage({
  title = "Meet with Chappy",
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="meet-root" data-entering="">
      <MeetThemeColor />
      <main className={styles.main}>
        <h1
          data-enter
          style={{ ["--enter" as string]: 0 }}
          className={styles.title}
        >
          {title}
        </h1>
        <p
          data-enter
          style={{ ["--enter" as string]: 1 }}
          className={styles.lede}
        >
          {children}
        </p>
        {actions && (
          <div
            data-enter
            style={{ ["--enter" as string]: 2 }}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            {actions}
          </div>
        )}
      </main>
    </div>
  );
}
