import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { getBookForOG } from "~/lib/books/ogDataAccess";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
};

export default async function BookLayout({ children, params }: LayoutProps) {
  const { bookId } = await params;

  let jsonLd = null;
  try {
    const book = await getBookForOG(bookId);

    jsonLd = {
      "@context": "https://schema.org",
      "@type": "Book",
      name: book.title,
      author: {
        "@type": "Person",
        name: book.author,
      },
      ...(book.publicationYear && {
        datePublished: String(book.publicationYear),
      }),
      ...(book.coverUrl && {
        image: enhanceCoverUrl(book.coverUrl) ?? book.coverUrl,
      }),
      ...(book.rating && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: book.rating,
          bestRating: 5,
          ratingCount: 1,
        },
      }),
      review: {
        "@type": "Review",
        author: {
          "@type": "Person",
          name: "Chappy Asel",
          url: "https://chappyasel.com",
        },
        ...(book.rating && {
          reviewRating: {
            "@type": "Rating",
            ratingValue: book.rating,
            bestRating: 5,
          },
        }),
        ...(book.finished && { datePublished: book.finished.split("T")[0] }),
      },
    };
  } catch {
    // Book not found, skip JSON-LD
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
