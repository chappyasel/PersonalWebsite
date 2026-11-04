import type { Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import "~/styles/daylight.css";

const title = "Meet with Chappy";
const description =
  "Pick a length and a time that's open on Chappy's calendar. Every time shows in your zone and Chappy's, and the invite lands in your inbox.";
const url = "https://www.chappyasel.com/meet";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: {
    title,
    description,
    url,
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@chappyasel",
    title,
    description,
  },
};

export default function MeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
