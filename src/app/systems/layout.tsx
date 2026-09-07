import { type Metadata } from "next";
import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";

import "~/styles/daylight.css";
import { SITE_PAGES } from "~/lib/site/pages";

// Served from the main host at /systems (no subdomain), so the root layout's
// metadataBase resolves every relative URL here and the icons hang off the
// path prefix the way Liar's Dice's do.
export const metadata: Metadata = {
  icons: siteIconMetadata("/systems"),
  title: "Personal Systems ~ Chappy Asel",
  description: SITE_PAGES.systems.description,
  openGraph: {
    title: "Personal Systems ~ Chappy Asel",
    description: SITE_PAGES.systems.description,
    url: "/systems",
    siteName: "Chappy's Personal Systems",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/images/systems-og.png",
        width: 1200,
        height: 630,
        alt: "Chappy's Personal Systems",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Personal Systems ~ Chappy Asel",
    description: SITE_PAGES.systems.description,
    images: ["/images/systems-og.png"],
  },
  alternates: {
    canonical: "/systems",
  },
};

export default function SystemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
