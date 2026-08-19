import type { Metadata } from "next";

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
