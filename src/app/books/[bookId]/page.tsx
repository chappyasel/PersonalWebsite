import { type Metadata } from "next";

import { getBookForOG } from "~/lib/books/ogDataAccess";
import { BookPage } from "./BookPage";

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
      title: `${book.title} - Book Notes`,
      description: `${book.author} • Read and reviewed by Chappy Asel`,
      openGraph: {
        title: book.title,
        description: `${book.author} • Book Notes by Chappy Asel`,
        images: [
          {
            url: `/books/${bookId}/opengraph-image`,
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
        images: [`/books/${bookId}/opengraph-image`],
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
  return <BookPage bookId={bookId} />;
}
