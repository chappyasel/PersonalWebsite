import { DEFAULT_SLUG } from "~/lib/booking/page";

import { HomeAction, MeetMessage } from "./MeetMessage";
import { PressLink } from "./PressButton";

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
          <PressLink href={`/${DEFAULT_SLUG}`}>See open times</PressLink>
          <HomeAction />
        </>
      }
    >
      It may have closed, or the address may be a letter off. Open times for
      anyone are on the main booking page.
    </MeetMessage>
  );
}
