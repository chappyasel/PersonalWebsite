import { type Metadata } from "next";

import {
  CSPostHogProvider,
  ObserverProvider,
  ThemeProvider,
} from "~/lib/providers";
import { TRPCReactProvider } from "~/trpc/react";

import "~/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  ),
  title: "Chappy Asel",
  description: "Chappy Asel",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-serif">
        <CSPostHogProvider>
          <TRPCReactProvider>
            <ObserverProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </ObserverProvider>
          </TRPCReactProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
