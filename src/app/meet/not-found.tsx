import Link from "next/link";

import { DEFAULT_SLUG } from "~/lib/booking/page";

import { Button } from "~/components/ui/button";

import { HomeAction, MeetMessage } from "./MeetMessage";
import styles from "./meet.module.css";

/**
 * A Booking link that's closed or unknown, in the booking page's look. It
 * says no more than that, so a stranger can't tell an old private link
 * from one that never was, and points to the link anyone can book.
 */
export default function MeetNotFound() {
  return (
    <MeetMessage
      heading="This link isn't open."
      actions={
        <>
          <Button asChild className={styles.primary}>
            <Link href={`/${DEFAULT_SLUG}`}>See open times</Link>
          </Button>
          <HomeAction />
        </>
      }
    >
      It may have closed, or the address may be a letter off. Open times for
      anyone are on the main booking page.
    </MeetMessage>
  );
}
