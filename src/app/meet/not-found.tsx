import { MESSAGES } from "~/lib/booking/request";

import { MeetMessage } from "./MeetMessage";

/**
 * A Booking link that's closed or unknown, in the booking page's look. It
 * says no more than that, so a stranger can't tell an old private link
 * from one that never was.
 */
export default function MeetNotFound() {
  return <MeetMessage>{MESSAGES.notFound}</MeetMessage>;
}
