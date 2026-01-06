import { type Metadata } from "next";

import {
  CSPostHogProvider,
  ObserverProvider,
  ThemeProvider,
} from "~/lib/providers";
import { TRPCReactProvider } from "~/trpc/react";

import "~/styles/globals.css";

export const metadata: Metadata = {
  title: "Chappy Asel",
  description: "Chappy Asel",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <CSPostHogProvider>
        <TRPCReactProvider>
          <ObserverProvider>
            <ThemeProvider>
              <body>{children}</body>
            </ThemeProvider>
          </ObserverProvider>
        </TRPCReactProvider>
      </CSPostHogProvider>
    </html>
  );
}
