import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { CSPostHogProvider, ObserverProvider } from "~/lib/providers";
import { TRPCReactProvider } from "~/trpc/react";
import { BookPreviewProvider } from "./contexts/BookPreviewContext";

import "~/styles/globals.css";

export const metadata: Metadata = {
  title: "Books - Chappy Asel",
  description: "My reading collection with notes and ratings",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function BooksLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="bg-background font-serif text-muted-foreground">
        <CSPostHogProvider>
          <TRPCReactProvider>
            <NuqsAdapter>
              <ObserverProvider>
                <BookPreviewProvider>
                  <main className="m-auto max-w-screen-2xl p-6 md:p-8">
                    {children}
                    {modal}
                  </main>
                </BookPreviewProvider>
              </ObserverProvider>
            </NuqsAdapter>
          </TRPCReactProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
