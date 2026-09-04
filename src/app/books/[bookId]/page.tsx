import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  getBookForOG,
  getBookshelfBookCount,
  getBookWithNotes,
  getSlugByNotionId,
} from "~/lib/books/ogDataAccess";
import { getBooksOrigin } from "~/lib/books/origin";
import { isNotionId } from "~/lib/books/slugify";
import { db } from "~/server/db";

import { BookDetailSkeleton } from "./BookDetailSkeleton";
import { BookPage } from "./BookPage";

// Revalidate every 24 hours
export const revalidate = 86400;

// Allow pages not in generateStaticParams to be generated on-demand
export const dynamicParams = true;

// Pre-render all book pages at build time
export async function generateStaticParams() {
  const books = await db.query.books.findMany({
    columns: { id: true },
  });
  return books.map((book) => ({ bookId: book.id }));
}

type PageProps = {
  params: Promise<{ bookId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const book = await getBookForOG(bookId);

    return {
      title: `${book.title} ~ Book Notes`,
      description: `${book.author} ~ Read and reviewed by Chappy Asel`,
      keywords: [book.title, book.author, ...book.tags, "book notes"],
      openGraph: {
        title: book.title,
        description: `${book.author} ~ Book Notes by Chappy Asel`,
        images: [
          {
            url: `/${bookId}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: `${book.title} cover and details`,
          },
        ],
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: book.title,
        description: book.author,
        images: [`/${bookId}/opengraph-image`],
      },
      alternates: {
        canonical: `/${bookId}`,
      },
      // Next resolves openGraph and alternates against metadataBase but
      // writes icons out verbatim, and a bare /:bookId/icon only resolves on
      // the books host. Absolute, it works from /books/:bookId too.
      icons: {
        icon: `${getBooksOrigin()}/${bookId}/icon`,
      },
    };
  } catch {
    return {
      title: "Book Not Found",
      description: "This book could not be found",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { bookId } = await params;
  // The data fetch lives behind the page's own Suspense boundary so the
  // page shell streams immediately. Without this, the pending boundary
  // during the fetch is the books segment's — whose fallback is the GRID
  // skeleton — and a book URL briefly renders as the bookshelf.
  return (
    <Suspense fallback={<BookDetailSkeleton />}>
      <BookLoader bookId={bookId} />
    </Suspense>
  );
}

async function BookLoader({ bookId }: { bookId: string }) {
  // If the bookId looks like a Notion UUID, try to redirect to the slug-based URL
  if (isNotionId(bookId)) {
    const slug = await getSlugByNotionId(bookId);
    if (slug) {
      redirect(`/books/${slug}`);
    }
    // If not found by notionId, continue to fetch and show BookPage
  }

  // Fetch the book and bookshelf size together for the standalone breadcrumb.
  const [book, bookshelfBookCount] = await Promise.all([
    getBookWithNotes(bookId),
    getBookshelfBookCount(),
  ]);

  if (!book) {
    notFound();
  }

  return (
    <BookPage
      bookId={bookId}
      book={book}
      bookshelfBookCount={bookshelfBookCount}
    />
  );
}
