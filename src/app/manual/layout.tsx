import { type Metadata } from "next";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { getRootOrigin } from "~/lib/site/origin";
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
  title: "Chappy's Personal Operating Manual",
  description: SITE_PAGES.manual.description,
  openGraph: {
    title: "Chappy's Personal Operating Manual",
    description: SITE_PAGES.manual.description,
    url: `${getRootOrigin()}/manual`,
    siteName: "Chappy Asel",
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
    title: "Chappy's Personal Operating Manual",
    description: SITE_PAGES.manual.description,
    images: ["/images/manual-og.png"],
  },
  alternates: {
    // HTML entry requests on the subdomain redirect to this document.
    canonical: `${getRootOrigin()}/manual`,
  },
};

export default function ManualLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
