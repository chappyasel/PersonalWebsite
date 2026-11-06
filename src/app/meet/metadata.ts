import type { Metadata } from "next";

import {
  type BookingPage,
  DEFAULT_SLUG,
  callPhrase,
  isPrivateSlug,
  lengthLabel,
  lengthWords,
} from "~/lib/booking/page";
import { meetPath } from "~/lib/booking/meetRoutes";
import type { PageRead } from "~/server/booking/daybreak";

const SITE = "https://www.chappyasel.com";
const HOST = "Chappy";

/** The one length a link offers, or null when the booker picks. */
export function onlyLength(link: BookingPage["link"]): number | null {
  return link.lengths.length === 1 ? link.lengths[0]! : null;
}

/**
 * A Booking link's title, description, share card, and search rules. Only
 * /meet is indexed; /meet/15, /aic, and the like are links the Owner sends, so
 * they stay out of search, and a private link's slug appears in no text
 * and no canonical URL.
 */
export function meetMetadata(slug: string, read: PageRead): Metadata {
  const link = read.status === "open" ? read.page.link : null;
  const host = link?.host ?? HOST;
  const name = link?.title ?? `Meet with ${host}`;
  const length = link ? onlyLength(link) : null;
  const title = length === null ? name : `${name} · ${lengthLabel(length)}`;
  const description = link
    ? `Book ${length === null ? "a time" : lengthWords(length)} with ${host} ${callPhrase(link.call)}. Times show in your zone.`
    : `Book a time with ${host}. Times show in your zone.`;
  const main = slug === DEFAULT_SLUG;
  const url = isPrivateSlug(slug) ? undefined : `${SITE}${meetPath(slug)}`;
  return {
    title: { absolute: title },
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    robots: main
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      ...(url ? { url } : {}),
      siteName: "Chappy Asel",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      creator: "@chappyasel",
      title,
      description,
    },
  };
}
