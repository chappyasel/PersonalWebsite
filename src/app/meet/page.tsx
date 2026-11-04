import type { Metadata } from "next";

import { DEFAULT_SLUG } from "~/lib/booking/page";

import { MeetScreen } from "./MeetScreen";
import { meetMetadata } from "./metadata";
import { readMeet } from "./read";

// Open time changes as the calendar does; the proxy caches reads for 30 s.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return meetMetadata(DEFAULT_SLUG, await readMeet(DEFAULT_SLUG));
}

export default function MeetPage() {
  return <MeetScreen slug={DEFAULT_SLUG} />;
}
