import HomePage from "../page";
import { type Metadata, type Viewport } from "next";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Golf | Chappy Asel",
  description: "A hidden four-ball golf green in Chappy Asel's 3D world.",
  alternates: { canonical: "/golf" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Golf | Chappy Asel",
    description: "A hidden four-ball golf green in Chappy Asel's 3D world.",
    url: "/golf",
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Golf | Chappy Asel",
    description: "A hidden four-ball golf green in Chappy Asel's 3D world.",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function GolfPage() {
  return <HomePage />;
}
