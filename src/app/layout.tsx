import { type Metadata } from "next";

import { CSPostHogProvider, ObserverProvider } from "~/lib/providers";
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
    <html lang="en">
      <CSPostHogProvider>
        <TRPCReactProvider>
          <ObserverProvider>
            <body>{children}</body>
          </ObserverProvider>
        </TRPCReactProvider>
      </CSPostHogProvider>
    </html>
  );
}
