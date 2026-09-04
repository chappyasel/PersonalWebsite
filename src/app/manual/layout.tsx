import { type Metadata } from "next";
import { devSubdomainUrl } from "~/lib/util";

import "~/styles/daylight.css";
import { SITE_PAGES } from "~/lib/site/pages";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://manual.chappyasel.com"
      : devSubdomainUrl("manual"),
  ),
  title: "Personal Operating Manual ~ Chappy Asel",
  description:
    SITE_PAGES.manual.description,
  openGraph: {
    title: "Personal Operating Manual ~ Chappy Asel",
    description:
      SITE_PAGES.manual.description,
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
    description:
      SITE_PAGES.manual.description,
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
