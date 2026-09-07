import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { getBooksOrigin } from "~/lib/books/origin";
import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { SITE_PAGES } from "~/lib/site/pages";
import { BooksTRPCProvider } from "~/trpc/books-provider";

import { BooksLayoutWrapper } from "./components/BooksLayoutWrapper";
import { ModalHost } from "./components/ModalHost";

import { BookPreviewProvider } from "./contexts/BookPreviewContext";

export const metadata: Metadata = {
  metadataBase: new URL(getBooksOrigin()),
  icons: siteIconMetadata(getBooksOrigin()),
  title: "Book Notes ~ Chappy Asel",
  description: SITE_PAGES.books.description,
  keywords: ["book notes", "book reviews", "reading list", "Chappy Asel"],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Book Notes ~ Chappy Asel",
    description: SITE_PAGES.books.description,
    url: "/",
    siteName: "Chappy's Book Notes",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@chappyasel",
    creator: "@chappyasel",
    title: "Book Notes ~ Chappy Asel",
    description: SITE_PAGES.books.description,
  },
  alternates: {
    canonical: "/",
  },
};

export default function BooksLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <BooksTRPCProvider>
      <BooksLayoutWrapper>
        <NuqsAdapter>
          <BookPreviewProvider>
            <main className="p-6 md:p-8">
              {children}
              {modal}
            </main>
            <ModalHost />
          </BookPreviewProvider>
        </NuqsAdapter>
      </BooksLayoutWrapper>
    </BooksTRPCProvider>
  );
}
