import { type Metadata, type Viewport } from "next";
import { Literata } from "next/font/google";

import { FontProvider } from "~/lib/font-provider";
import { ThemeProvider } from "~/lib/providers";
import { THEME_COLOR, THEME_STORAGE_KEY } from "~/lib/theme";

import AnalyticsRouteTracker from "./components/AnalyticsRouteTracker";
import { UniversalSearchController } from "~/components/universal-search/UniversalSearchController";

import { HOMEPAGE_DESCRIPTION } from "./homeMetadata";
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

/**
 * Runs before next-themes' own inline script (that one is rendered inside
 * <body>), and does two things it can't:
 *
 * 1. Mirrors the cross-subdomain `theme` cookie into localStorage, which is the
 *    only place next-themes looks. Without this, landing on books.chappyasel.com
 *    with a preference set on chappyasel.com paints the wrong theme for a frame
 *    and only corrects after hydration.
 * 2. Emits <meta name="theme-color"> so mobile browser chrome matches on the
 *    very first paint. ThemeColorSync keeps it current after that.
 */
const themeBootstrapScript = `
try {
  var m = /(?:^|; )theme=([^;]*)/.exec(document.cookie);
  var c = m ? decodeURIComponent(m[1]) : null;
  if (c === "light" || c === "dark" || c === "system") {
    if (c !== localStorage.getItem("${THEME_STORAGE_KEY}")) {
      localStorage.setItem("${THEME_STORAGE_KEY}", c);
    }
  }
  var t = localStorage.getItem("${THEME_STORAGE_KEY}") || "system";
  var dark =
    t === "dark" ||
    (t === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  var meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = dark ? "${THEME_COLOR.dark}" : "${THEME_COLOR.light}";
  document.head.appendChild(meta);
} catch (_) {}
`;

// Let native controls and browser chrome follow the resolved light/dark
// palette on every route. The homepage adds `viewportFit: "cover"` in its
// own segment because only that fixed, safe-area-aware experience paints into
// the display cutouts.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://www.chappyasel.com"
      : (process.env.NEXTAUTH_URL ??
        `http://localhost:${process.env.PORT ?? 3000}`),
  ),
  title: "Chappy Asel",
  description: HOMEPAGE_DESCRIPTION,
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
  sheet,
}: Readonly<{ children: React.ReactNode; sheet: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={literata.variable}
      data-font="georgia"
    >
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/uvz5cfn.css" />
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
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider>
          <FontProvider>
            <UniversalSearchController />
            <AnalyticsRouteTracker />
            {children}
            {sheet}
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
