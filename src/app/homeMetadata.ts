import type { Metadata, Viewport } from "next";

export const HOMEPAGE_TITLE = "Chappy Asel";
export const HOMEPAGE_DESCRIPTION =
  "Chappy Asel is a technologist and community builder who founded The AI Collective. His work spans AI, relationships, books, and human agency.";

export const homepageMetadata: Metadata = {
  title: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  authors: [{ name: "Chappy Asel", url: "https://www.chappyasel.com" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
    url: "/",
    siteName: HOMEPAGE_TITLE,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
  },
};

/** The room paints beneath iOS Safari's chrome and handles the safe areas in
 * its own fixed UI. Every route that renders the room shares this. */
export const roomViewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
};

/** The homepage's composed card, as a route. File-based metadata images do
 * not cascade to sibling routes (`/golf` shipped with no image at all), so
 * every room stop names the homepage's card until it has a still of its own. */
const HOME_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: HOMEPAGE_TITLE,
};

/** Metadata for a room stop that owns a path. A hash never reaches the
 * server, so `/#projects` could only ever unfurl as the homepage; a path
 * carries the stop's own title and line over the homepage's card. */
export function roomStopMetadata({
  path,
  title,
  description,
  canonical = path,
  index = true,
}: {
  path: string;
  title: string;
  description: string;
  /** Where search engines should credit the page. About's stop is the
   * homepage, so `/about` points at `/`. */
  canonical?: string;
  /** Hidden stops (golf) stay out of the index. */
  index?: boolean;
}): Metadata {
  // The site's separator: "Liar's Dice Calculator ~ Chappy Asel", "<book> ~
  // Chappy's Book Notes". Golf used a pipe until it shared this helper.
  const fullTitle = `${title} ~ ${HOMEPAGE_TITLE}`;
  return {
    title: fullTitle,
    description,
    alternates: { canonical },
    ...(index ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: HOMEPAGE_TITLE,
      locale: "en_US",
      type: "website",
      images: [HOME_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      site: "@chappyasel",
      creator: "@chappyasel",
      title: fullTitle,
      description,
      images: [HOME_OG_IMAGE],
    },
  };
}
