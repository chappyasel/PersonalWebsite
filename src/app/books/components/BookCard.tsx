"use client";

import Image from "next/image";
import { FileText } from "lucide-react";
import { useQueryState } from "nuqs";

import { Badge } from "~/components/ui/badge";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";

type BookCardProps = {
  book: Book;
};

export function BookCard({ book }: BookCardProps) {
  const [, setBookId] = useQueryState("book");
  const coverUrl = enhanceCoverUrl(book.coverUrl);

  const handleClick = () => {
    void setBookId(book.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative cursor-pointer overflow-hidden rounded-2xl shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] transition-all duration-300 hover:scale-105 hover:rotate-1 hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] focus:outline-none focus:ring-2 focus:ring-title/20 focus:ring-offset-2 intersect:motion-scale-in-90 intersect:motion-opacity-in-50"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View details for ${book.title} by ${book.author}`}
    >
      {/* Cover Image (aspect ratio 2:3) */}
      <div className="aspect-[2/3] w-full overflow-hidden bg-cell/20">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={`${book.title} cover`}
            className="h-full w-full object-cover"
            width={1000}
            height={1000}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <p className="line-clamp-3 text-sm font-bold text-title">
              {book.title}
            </p>
            <p className="mt-2 line-clamp-2 text-xs text-body">{book.author}</p>
          </div>
        )}
      </div>

      {/* No Notes Badge */}
      {!book.hasNotes && (
        <Badge
          variant="secondary"
          className="absolute bottom-2 right-2 gap-1 bg-red-50/90 text-red-600/80 shadow-md"
        >
          <FileText className="h-3 w-3" />
          <span className="text-xs">No Notes</span>
        </Badge>
      )}

      {/* Overlay with title/author on hover */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
        <h3 className="line-clamp-2 text-sm font-bold text-white">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-white/80">{book.author}</p>
        {book.rating && (
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg
                key={i}
                className={`h-3 w-3 ${i < book.rating! ? "fill-yellow-400" : "fill-white/30"}`}
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
