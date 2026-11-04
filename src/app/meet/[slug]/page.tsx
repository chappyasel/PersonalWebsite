import { MeetScreen } from "../MeetScreen";
import { meetMetadata } from "../metadata";
import { readMeet } from "../read";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { DEFAULT_SLUG, SLUG_PATTERN } from "~/lib/booking/page";

// Open time changes as the calendar does; the proxy caches reads for 30 s.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** The Owner's other links: /meet/15, /meet/60, or a private slug. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return {};
  return meetMetadata(slug, await readMeet(slug));
}

export default async function MeetLinkPage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();
  if (slug === DEFAULT_SLUG) permanentRedirect("/meet");
  return <MeetScreen slug={slug} />;
}
