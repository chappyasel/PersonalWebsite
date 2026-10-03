import type { Metadata, Viewport } from "next";

export const HOMEPAGE_TITLE = "Chappy Asel";
export const HOMEPAGE_DESCRIPTION =
  "Chappy Asel is a serial entrepreneur, engineer, and investor focused on AI. Founder of The AI Collective. Previously at Apple.";

const HOMEPAGE_URL = "https://www.chappyasel.com/";
const PROFILE_IMAGE_URL = `${HOMEPAGE_URL}images/about/profile.jpg`;

// Google can choose a thumbnail from any image in the homepage's article
// list. Identify the portrait explicitly as the page's preferred image.
// https://developers.google.com/search/docs/appearance/google-images
export const homepageStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${HOMEPAGE_URL}#webpage`,
  url: HOMEPAGE_URL,
  name: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  primaryImageOfPage: PROFILE_IMAGE_URL,
  mainEntity: {
    "@type": "Person",
    "@id": `${HOMEPAGE_URL}#person`,
    name: HOMEPAGE_TITLE,
    url: HOMEPAGE_URL,
    description: HOMEPAGE_DESCRIPTION,
    image: PROFILE_IMAGE_URL,
    sameAs: [
      "https://www.linkedin.com/in/chappyasel/",
      "https://x.com/chappyasel",
    ],
  },
};

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
 * not cascade to sibling routes (`/golf` shipped with no image at all), so a
 * room stop without a card of its own names this one. */
const HOME_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
};

/** Metadata for a room stop that owns a path. A hash never reaches the
 * server, so `/#projects` could only ever unfurl as the homepage; a path
 * carries the stop's own title, line, and card. */
export function roomStopMetadata({
  path,
  title,
  description,
  canonical = path,
  index = true,
  ownCard = false,
}: {
  path: string;
  /** The page title as it reads in a tab and a share: "Chappy's Projects". */
  title: string;
  description: string;
  /** Where search engines should credit the page. About's stop is the
   * homepage, so `/about` points at `/`. */
  canonical?: string;
  /** Hidden stops (golf) stay out of the index. */
  index?: boolean;
  /** The route has its own `opengraph-image.tsx`. Its images are then left
   * out here so the file convention attaches the card, with a content hash
   * in its URL; images named here would replace it. */
  ownCard?: boolean;
}): Metadata {
  const images = ownCard ? undefined : [{ ...HOME_OG_IMAGE, alt: title }];
  return {
    title,
    description,
    alternates: { canonical },
    ...(index ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title,
      description,
      url: path,
      siteName: HOMEPAGE_TITLE,
      locale: "en_US",
      type: "website",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: "@chappyasel",
      creator: "@chappyasel",
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}
