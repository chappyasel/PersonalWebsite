import { type Metadata, type Viewport } from "next";
import { Literata } from "next/font/google";

import { FontProvider } from "~/lib/font-provider";
import {
  CSPostHogProvider,
  ObserverProvider,
  ThemeProvider,
} from "~/lib/providers";
import { TRPCReactProvider } from "~/trpc/react";

import { georgiaPro } from "~/fonts";
import "~/styles/globals.css";

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

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
      className={`${literata.variable} ${georgiaPro.variable}`}
    >
      <body className="font-serif">
        <CSPostHogProvider>
          <TRPCReactProvider>
            <ObserverProvider>
              <ThemeProvider>
                <FontProvider>{children}</FontProvider>
              </ThemeProvider>
            </ObserverProvider>
          </TRPCReactProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
