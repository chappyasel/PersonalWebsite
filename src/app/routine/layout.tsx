import { type Metadata } from "next";
import { devSubdomainUrl } from "~/lib/util";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://routine.chappyasel.com"
      : devSubdomainUrl("routine"),
  ),
  title: "Core Daily Routine ~ Chappy Asel",
  description:
    "My infamously early morning routine, workout schedule, supplement stacks, and sleep optimization.",
  openGraph: {
    title: "Core Daily Routine ~ Chappy Asel",
    description:
      "My infamously early morning routine, workout schedule, supplement stacks, and sleep optimization.",
    url: "/",
    siteName: "Chappy's Core Daily Routine",
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
    title: "Core Daily Routine ~ Chappy Asel",
    description:
      "My infamously early morning routine, workout schedule, supplement stacks, and sleep optimization.",
    images: ["/images/routine-og.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export default function RoutineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
