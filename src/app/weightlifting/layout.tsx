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
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <NuqsAdapter>
        <main className="p-6 md:p-8">{children}</main>
      </NuqsAdapter>
    </TRPCReactProvider>
  );
}
