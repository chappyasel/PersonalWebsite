import { type Metadata, type Viewport } from "next";
import { Literata } from "next/font/google";

import { FontProvider } from "~/lib/font-provider";
import { ObserverProvider, ThemeProvider } from "~/lib/providers";

import "~/styles/globals.css";

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
  preload: false,
});

const fontPreferenceScript = `
try {
  var font = localStorage.getItem("font-preference");
  document.documentElement.dataset.font =
    font === "system" || font === "literata" || font === "georgia"
      ? font
      : "georgia";
} catch (_) {
  document.documentElement.dataset.font = "georgia";
}
`;

export const viewport: Viewport = {};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXTAUTH_URL ??
        `http://localhost:${process.env.PORT ?? 3000}`),
  ),
  title: "Chappy Asel",
  description:
    "Chappy Asel builds tools, communities, and systems around AI, relationships, books, and human agency.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={literata.variable}
      data-font="georgia"
    >
      <head>
        <link
          rel="preload"
          href="/fonts/v1/GeorgiaPro-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/v1/GeorgiaPro-SemiBold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: fontPreferenceScript }} />
      </head>
      <body>
        <ObserverProvider>
          <ThemeProvider>
            <FontProvider>{children}</FontProvider>
          </ThemeProvider>
        </ObserverProvider>
      </body>
    </html>
  );
}
