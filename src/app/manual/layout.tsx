import { type Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://manual.chappyasel.com"
      : "http://manual.localhost:3000",
  ),
  title: "Personal Operating Manual ~ Chappy Asel",
  description:
    "How I work, communicate, and collaborate. A guide to working with Chappy Asel.",
  openGraph: {
    title: "Personal Operating Manual ~ Chappy Asel",
    description:
      "How I work, communicate, and collaborate. A guide to working with Chappy Asel.",
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
      "How I work, communicate, and collaborate. A guide to working with Chappy Asel.",
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
