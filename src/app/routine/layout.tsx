import { type Metadata } from "next";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { getRootOrigin } from "~/lib/site/origin";
import { SITE_PAGES } from "~/lib/site/pages";
import { devSubdomainUrl } from "~/lib/util";

import "~/styles/daylight.css";

const origin =
  process.env.NODE_ENV === "production"
    ? "https://routine.chappyasel.com"
    : devSubdomainUrl("routine");

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  icons: siteIconMetadata(origin),
  title: "Chappy's Core Daily Routine",
  description: SITE_PAGES.routine.description,
  openGraph: {
    title: "Chappy's Core Daily Routine",
    description: SITE_PAGES.routine.description,
    url: `${getRootOrigin()}/routine`,
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/images/routine-og.png",
        width: 1200,
        height: 630,
        alt: "Chappy's Core Daily Routine",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Chappy's Core Daily Routine",
    description: SITE_PAGES.routine.description,
    images: ["/images/routine-og.png"],
  },
  alternates: {
    // HTML entry requests on the subdomain redirect to this document.
    canonical: `${getRootOrigin()}/routine`,
  },
};

export default function RoutineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
