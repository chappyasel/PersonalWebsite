import { type Metadata } from "next";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { SITE_PAGES } from "~/lib/site/pages";
import { devSubdomainUrl } from "~/lib/util";

import "~/styles/daylight.css";

const origin =
  process.env.NODE_ENV === "production"
    ? "https://manual.chappyasel.com"
    : devSubdomainUrl("manual");

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  icons: siteIconMetadata(origin),
  title: "Personal Operating Manual ~ Chappy Asel",
  description: SITE_PAGES.manual.description,
  openGraph: {
    title: "Personal Operating Manual ~ Chappy Asel",
    description: SITE_PAGES.manual.description,
    url: "/",
    siteName: "Chappy's Personal Operating Manual",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/images/manual-og.png",
        width: 1200,
        height: 630,
        alt: "Chappy's Personal Operating Manual",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Personal Operating Manual ~ Chappy Asel",
    description: SITE_PAGES.manual.description,
    images: ["/images/manual-og.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export default function ManualLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
