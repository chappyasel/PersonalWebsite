import Link from "next/link";
import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { ArrowLeft, Share2 } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getBookForOG } from "~/lib/books/ogDataAccess";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { getTagColor } from "~/lib/books/tagColors";

type PageProps = {
  params: { bookId: string };
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  try {
    const book = await getBookForOG(params.bookId);

    return {
      title: `${book.title} - Book Notes`,
      description: `${book.author} • Read and reviewed by Chappy Asel`,
      openGraph: {
        title: book.title,
        description: `${book.author} • Book Notes by Chappy Asel`,
        images: [
          {
            url: `/books/${params.bookId}/opengraph-image`,
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
        images: [`/books/${params.bookId}/opengraph-image`],
      },
    };
  } catch {
    return {
      title: "Book Not Found",
      description: "This book could not be found",
    };
  }
}

export default async function BookPage({ params }: PageProps) {
  let book;
  try {
    book = await getBookForOG(params.bookId);
  } catch {
    notFound();
  }

  const coverUrl = enhanceCoverUrl(book.coverUrl);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-6 md:p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/books"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={20} />
            <span>Back to Collection</span>
          </Link>

          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                void navigator.clipboard.writeText(window.location.href);
                // Could add a toast notification here
              }
            }}
            className="flex items-center gap-2 rounded-lg bg-neutral-200 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-neutral-300 hover:text-foreground"
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left: Info */}
          <div className="space-y-8">
            {/* Cover */}
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`${book.title} cover`}
                className="mx-auto w-full max-w-[300px] rounded-xl shadow-[0px_10px_40px_rgba(0,0,0,0.2)]"
              />
            ) : (
              <div className="mx-auto flex aspect-[2/3] w-full max-w-[300px] items-center justify-center rounded-xl bg-muted p-6 text-center shadow-[0px_10px_40px_rgba(0,0,0,0.1)]">
                <p className="text-lg font-bold text-foreground">{book.title}</p>
              </div>
            )}

            {/* Rating */}
            {book.rating && (
              <div className="flex justify-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className={`h-6 w-6 ${i < book.rating! ? "fill-yellow-400" : "fill-body/20"}`}
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            )}

            {/* Header info */}
            <div>
              <h1 className="mb-3 text-4xl font-bold leading-tight text-foreground">
                {book.title}
              </h1>
              <p className="mb-4 text-xl text-muted-foreground">{book.author}</p>

              {/* Metadata */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground/70">
                {book.publicationYear && (
                  <div>
                    <span className="font-medium">Published:</span>{" "}
                    {book.publicationYear}
                  </div>
                )}
                {book.started && (
                  <div>
                    <span className="font-medium">Started:</span>{" "}
                    {new Date(book.started).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
                {book.finished && (
                  <div>
                    <span className="font-medium">Finished:</span>{" "}
                    {new Date(book.finished).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
              </div>

              {/* Tags */}
              {book.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {book.tags.map((tag) => {
                    const colors = getTagColor(tag);
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.fg,
                          borderColor: colors.border,
                        }}
                      >
                        {tag}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* View in Notion */}
            <div className="border-t border-muted-foreground/10 pt-6">
              <Button
                variant="ghost"
                asChild
                className="h-auto p-0 text-sm font-medium text-foreground hover:bg-transparent hover:text-muted-foreground"
              >
                <a
                  href={book.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  View in Notion
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </Button>
            </div>
          </div>

          {/* Right: Notes */}
          {book.hasNotes && (
            <div className="lg:border-l lg:border-muted-foreground/10 lg:pl-8">
              <div className="prose prose-neutral prose-sm max-w-none leading-relaxed text-muted-foreground prose-headings:font-bold prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg prose-h5:text-base prose-h6:text-sm prose-p:text-muted-foreground prose-a:text-foreground prose-a:underline hover:prose-a:text-muted-foreground prose-strong:text-foreground prose-strong:font-bold prose-ul:list-disc prose-ol:list-decimal prose-li:text-muted-foreground prose-img:rounded-lg prose-img:shadow-md">
                {/* Notes would be loaded here - we need to fetch them separately or include in the query */}
                <p className="text-muted-foreground/70">
                  This book has notes. View them in the{" "}
                  <Link
                    href={`/books?book=${book.id}`}
                    className="text-foreground underline hover:text-muted-foreground"
                  >
                    modal view
                  </Link>{" "}
                  or in{" "}
                  <a
                    href={book.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline hover:text-muted-foreground"
                  >
                    Notion
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
