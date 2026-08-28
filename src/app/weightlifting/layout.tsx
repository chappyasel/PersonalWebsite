import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { devSubdomainUrl } from "~/lib/util";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://weightlifting.chappyasel.com"
      : devSubdomainUrl("weightlifting"),
  ),
  title: "Weightlifting ~ Chappy Asel",
  description: "Workout stats, personal records, and training log",
  keywords: ["weightlifting", "workout tracker", "personal records", "Chappy Asel"],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Weightlifting ~ Chappy Asel",
    description: "Workout stats, personal records, and training log",
    url: "/",
    siteName: "Chappy's Weightlifting Log",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Weightlifting ~ Chappy Asel",
    description: "Workout stats, personal records, and training log",
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
        <main className="p-6 md:p-8">{children}</main>
        {sheet}
      </NuqsAdapter>
    </TRPCReactProvider>
  );
}
