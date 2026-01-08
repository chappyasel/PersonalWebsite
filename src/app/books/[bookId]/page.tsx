import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  getBookForOG,
  getBookWithNotes,
  getSlugByNotionId,
} from "~/lib/books/ogDataAccess";
import { isNotionId } from "~/lib/books/slugify";
import { db } from "~/server/db";

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

  // If the bookId looks like a Notion UUID, try to redirect to the slug-based URL
  if (isNotionId(bookId)) {
    const slug = await getSlugByNotionId(bookId);
    if (slug) {
      redirect(`/books/${slug}`);
    }
    // If not found by notionId, continue to fetch and show BookPage
  }

  // Fetch book data server-side
  const book = await getBookWithNotes(bookId);

  if (!book) {
    notFound();
  }

  return <BookPage bookId={bookId} book={book} />;
}
