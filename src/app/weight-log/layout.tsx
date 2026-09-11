import type { Metadata } from "next";

const title = "Chappy's Weight Log";
const description =
  "Bodyweight history, training phases, and DEXA scans in an interactive chart.";
const url = "https://www.chappyasel.com/weight-log";
const image = {
  url: "https://www.chappyasel.com/images/weight-log-og.png",
  width: 1200,
  height: 630,
  alt: "Chappy's Weight Log. Bodyweight history, training phases, and DEXA scans.",
};

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
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@chappyasel",
    title,
    description,
    images: [image],
  },
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function WeightLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-800">
      <main className="ph-no-capture ph-mask mx-auto max-w-7xl p-6 font-sans md:p-8">
        {children}
      </main>
    </div>
  );
}
