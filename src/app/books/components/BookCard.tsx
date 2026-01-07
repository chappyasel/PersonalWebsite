"use client";

import { useBookPreview } from "../contexts/BookPreviewContext";
import { StarIcon } from "@phosphor-icons/react/dist/ssr";
import {
  type SpringOptions,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { FileText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import type { Book } from "~/lib/books/types";

import { Badge } from "~/components/ui/badge";

type BookCardProps = {
  book: Book;
  size?: "S" | "M" | "L";
};

const sizeRadius = {
  S: "rounded-lg",
  M: "rounded-xl",
  L: "rounded-2xl",
} as const;

const sizeStyles = {
  S: {
    placeholderTitle: "text-xs",
    placeholderAuthor: "text-[10px]",
    badgeText: "text-[10px]",
    badgeIcon: "h-2.5 w-2.5",
    overlayTitle: "text-xs",
    overlayAuthor: "text-[10px]",
    star: "!size-4",
    badgeSpacing: "top-1.5 right-1.5",
    overlayPadding: "p-3",
  },
  M: {
    placeholderTitle: "text-sm",
    placeholderAuthor: "text-xs",
    badgeText: "text-xs",
    badgeIcon: "h-3 w-3",
    overlayTitle: "text-sm",
    overlayAuthor: "text-xs",
    star: "!size-[18px]",
    badgeSpacing: "top-2 right-2",
    overlayPadding: "p-4",
  },
  L: {
    placeholderTitle: "text-base",
    placeholderAuthor: "text-sm",
    badgeText: "text-sm",
    badgeIcon: "h-3.5 w-3.5",
    overlayTitle: "text-base",
    overlayAuthor: "text-sm",
    star: "!size-5",
    badgeSpacing: "top-3 right-3",
    overlayPadding: "p-5",
  },
} as const;

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2,
};

const hoverScale = {
  S: 1.15, // Larger scale for small books
  M: 1.1, // Medium scale
  L: 1.05, // Smaller scale for large books
} as const;

const tiltAmplitude = {
  S: 20, // More tilt for small books
  M: 15, // Medium tilt
  L: 10, // Less tilt for large books
} as const;

export function BookCard({ book, size = "M" }: BookCardProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const styles = sizeStyles[size];
  const { setSelectedBook } = useBookPreview();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const searchParams = useSearchParams();

  // Motion values for 3D tilt effect
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const rotateAmplitude = tiltAmplitude[size]; // Degrees of rotation

  // Preserve current query params when navigating to book detail
  const bookUrl = `/books/${book.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const handleClick = () => {
    setSelectedBook(book, size);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);
  };

  const handleMouseEnter = () => {
    scale.set(hoverScale[size]);
  };

  const handleMouseLeave = () => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <Link
      ref={cardRef}
      href={bookUrl}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      scroll={false}
      className="group relative block cursor-pointer [perspective:1000px] hover:z-10 intersect:motion-scale-in-90 intersect:motion-opacity-in-50"
      aria-label={`View details for ${book.title} by ${book.author}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      <motion.div
        className={`relative overflow-hidden ${sizeRadius[size]} shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] transition-shadow duration-300 [transform-style:preserve-3d] hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] focus:outline-none`}
        style={{
          rotateX,
          rotateY,
          scale,
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      >
        {/* Cover Image (aspect ratio 2:3) */}
        <div className="aspect-[2/3] w-full overflow-hidden bg-muted/20">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={`${book.title} cover`}
              className="h-full w-full object-cover"
              width={1000}
              height={1500}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
              <p
                className={`line-clamp-3 font-bold text-foreground ${styles.placeholderTitle}`}
              >
                {book.title}
              </p>
              <p
                className={`mt-2 line-clamp-2 text-muted-foreground ${styles.placeholderAuthor}`}
              >
                {book.author}
              </p>
            </div>
          )}
        </div>

        {/* No Notes Badge */}
        {!book.hasNotes && (
          <Badge
            variant="secondary"
            className={`absolute gap-1 bg-red-50/90 text-red-600/80 shadow-md dark:bg-red-950/90 dark:text-red-400/90 ${styles.badgeSpacing}`}
          >
            <FileText className={styles.badgeIcon} />
            <span className={styles.badgeText}>No Notes</span>
          </Badge>
        )}

        {/* Overlay with title/author on hover */}
        <div
          className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-stone-900/80 via-stone-900/60 via-30% to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${styles.overlayPadding}`}
        >
          <h3
            className={`line-clamp-3 font-bold leading-tight text-white shadow-[0px_5px_10px_rgba(0,0,0,0.6)] ${styles.overlayTitle}`}
          >
            {book.title}
          </h3>
          <p
            className={`line-clamp-1 pt-0.5 text-white/80 shadow-[0px_5px_10px_rgba(0,0,0,0.6)] ${styles.overlayAuthor}`}
          >
            {book.author}
          </p>
          {book.rating && (
            <div className="mt-1 flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon
                  key={i}
                  weight={i < book.rating! ? "fill" : "duotone"}
                  className={`${styles.star} ${i < book.rating! ? "text-yellow-400" : "text-white/30"}`}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
