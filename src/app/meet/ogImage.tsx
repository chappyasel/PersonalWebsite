import { ImageResponse } from "next/og";
import "server-only";

import { MeetOgCard, OG_SIZE, loadMeetOgFonts, ogFacts } from "./ogCard";
import { readMeet } from "./read";

/** A Booking link's share card, with its own length. */
export async function meetOgImage(slug: string) {
  const [fonts, read] = await Promise.all([loadMeetOgFonts(), readMeet(slug)]);
  return new ImageResponse(<MeetOgCard {...ogFacts(read)} />, {
    ...OG_SIZE,
    fonts,
  });
}
