import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Modal } from "./components/Modal";

import { BookPreviewProvider } from "./contexts/BookPreviewContext";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://books.chappyasel.com"
      : "http://books.localhost:3000",
  ),
  title: "Book Notes ~ Chappy Asel",
  description: "My reading collection with notes and reviews",
  keywords: ["book notes", "book reviews", "reading list", "Chappy Asel"],
  authors: [{ name: "Chappy Asel", url: "https://chappyasel.com" }],
  openGraph: {
    title: "Book Notes ~ Chappy Asel",
    description: "My reading collection with notes and reviews",
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
    description: "My reading collection with notes and reviews",
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
    <div className="min-h-screen bg-background font-serif text-foreground">
      <NuqsAdapter>
        <BookPreviewProvider>
          <main className="p-6 md:p-8">
            {children}
            {modal}
          </main>
          <Modal />
        </BookPreviewProvider>
      </NuqsAdapter>
    </div>
  );
}
