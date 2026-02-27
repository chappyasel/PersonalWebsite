import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export const metadata: Metadata = {
  title: "Liar's Dice Calculator ~ Chappy Asel",
  description:
    "Probability calculator for Liar's Dice. Compute optimal bids and call probabilities.",
  keywords: ["liar's dice", "probability calculator", "dice game", "Chappy Asel"],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Liar's Dice Calculator ~ Chappy Asel",
    description:
      "Probability calculator for Liar's Dice. Compute optimal bids and call probabilities.",
    url: "/liarsdice",
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Liar's Dice Calculator ~ Chappy Asel",
    description:
      "Probability calculator for Liar's Dice. Compute optimal bids and call probabilities.",
  },
};

export default function LiarsDiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
