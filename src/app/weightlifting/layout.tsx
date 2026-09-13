import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { SITE_PAGES } from "~/lib/site/pages";
import { devSubdomainUrl } from "~/lib/util";
import { TRPCReactProvider } from "~/trpc/react";

const origin =
  process.env.NODE_ENV === "production"
    ? "https://weightlifting.chappyasel.com"
    : devSubdomainUrl("weightlifting");

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  icons: siteIconMetadata(origin),
  title: "Chappy's Weightlifting",
  description: SITE_PAGES.weightlifting.description,
  keywords: [
    "weightlifting",
    "workout tracker",
    "personal records",
    "Chappy Asel",
  ],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Chappy's Weightlifting",
    description: SITE_PAGES.weightlifting.description,
    url: "/",
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Chappy's Weightlifting",
    description: SITE_PAGES.weightlifting.description,
  },
  alternates: {
    canonical: "/",
  },
};

export default function WeightliftingLayout({
  children,
  sheet,
}: {
  children: React.ReactNode;
  sheet: React.ReactNode;
}) {
  // `sheet` is the intercepted-route slot: an exercise page opened from
  // inside the app renders as a modal sheet over the launcher instead of
  // replacing it. Hard loads fall through to the slot's default (null) and
  // the real full page.
  return (
    <TRPCReactProvider>
      <NuqsAdapter>
        <main className="p-3 sm:p-6 md:p-8">{children}</main>
        {sheet}
      </NuqsAdapter>
    </TRPCReactProvider>
  );
}
