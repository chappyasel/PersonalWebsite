import { ImageResponse } from "next/og";
import "server-only";

import {
  MeetOgCard,
  OG_SIZE,
  loadMeetOgFonts,
  loadMeetOgPortrait,
  ogFacts,
} from "./ogCard";
import { readMeet } from "./read";

/** A Booking link's share card, with its own length. */
export async function meetOgImage(slug: string) {
  const [fonts, portrait, read] = await Promise.all([
    loadMeetOgFonts(),
    loadMeetOgPortrait(),
    readMeet(slug),
  ]);
  return new ImageResponse(
    <MeetOgCard {...ogFacts(read)} portrait={portrait} />,
    {
      ...OG_SIZE,
      fonts,
    },
  );
}
