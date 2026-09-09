import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { getBooksOrigin } from "~/lib/books/origin";
import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { loadSitePageCards } from "~/lib/site/pageCards";
import { SITE_PAGES } from "~/lib/site/pages";
import { BooksTRPCProvider } from "~/trpc/books-provider";

import { BooksLayoutWrapper } from "./components/BooksLayoutWrapper";
import { ModalHost } from "./components/ModalHost";
import { SitePageCardsProvider } from "~/components/site/SitePageCards";

import { BookPreviewProvider } from "./contexts/BookPreviewContext";

export const metadata: Metadata = {
  metadataBase: new URL(getBooksOrigin()),
  icons: siteIconMetadata(getBooksOrigin()),
  title: "Chappy's Book Notes",
  description: SITE_PAGES.books.description,
  keywords: ["book notes", "book reviews", "reading list", "Chappy Asel"],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Chappy's Book Notes",
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
    title: "Chappy's Book Notes",
    description: SITE_PAGES.books.description,
  },
  alternates: {
    canonical: "/",
  },
};

export default async function BooksLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  // The breadcrumb at the top of a book hovers the same stats card a link
  // to the library shows on the documents; the library is the only page a
  // book points at, so the workout card is not loaded here.
  const cards = await loadSitePageCards("books", ["books"]);
  return (
    <BooksTRPCProvider>
      <BooksLayoutWrapper>
        <NuqsAdapter>
          <BookPreviewProvider>
            <SitePageCardsProvider cards={cards}>
              <main className="p-6 md:p-8">
                {children}
                {modal}
              </main>
              <ModalHost />
            </SitePageCardsProvider>
          </BookPreviewProvider>
        </NuqsAdapter>
      </BooksLayoutWrapper>
    </BooksTRPCProvider>
  );
}
