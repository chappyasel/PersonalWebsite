import { type Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { TRPCReactProvider } from "~/trpc/react";
import { CSPostHogProvider, ObserverProvider } from "~/lib/providers";

import "~/styles/globals.css";

export const metadata: Metadata = {
  title: "Books - Chappy Asel",
  description: "My reading collection with notes and ratings",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function BooksLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <CSPostHogProvider>
        <TRPCReactProvider>
          <NuqsAdapter>
            <ObserverProvider>
              <body className="bg-background text-body font-serif">
                <main className="m-auto max-w-screen-2xl p-4 md:p-8">
                  {children}
                </main>
              </body>
            </ObserverProvider>
          </NuqsAdapter>
        </TRPCReactProvider>
      </CSPostHogProvider>
    </html>
  );
}
