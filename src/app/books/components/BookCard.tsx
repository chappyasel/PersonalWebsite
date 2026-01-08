"use client";

import { useModalActions } from "../contexts/BookPreviewContext";
import { LinkIcon } from "@phosphor-icons/react";
import { CheckIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import {
  type SpringOptions,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { BookOpen, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { memo, useEffect, useRef, useState } from "react";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { getBookPath } from "~/lib/books/paths";
import { isCurrentlyReading } from "~/lib/books/types";
import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

import { Badge } from "~/components/ui/badge";

import { cn } from "@/src/lib/util";

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
    badgeSpacing: "top-1.5 left-1.5",
    overlayPadding: "p-3",
    copyButton: "top-1.5 right-1.5 p-1",
    copyIcon: "size-3.5",
  },
  M: {
    placeholderTitle: "text-sm",
    placeholderAuthor: "text-xs",
    badgeText: "text-xs",
    badgeIcon: "h-3 w-3",
    overlayTitle: "text-sm",
    overlayAuthor: "text-xs",
    star: "!size-[18px]",
    badgeSpacing: "top-2 left-2",
    overlayPadding: "p-4",
    copyButton: "top-2 right-2 p-1.5",
    copyIcon: "size-5",
  },
  L: {
    placeholderTitle: "text-base",
    placeholderAuthor: "text-sm",
    badgeText: "text-sm",
    badgeIcon: "h-3.5 w-3.5",
    overlayTitle: "text-base",
    overlayAuthor: "text-sm",
    star: "!size-5",
    badgeSpacing: "top-3 left-3",
    overlayPadding: "p-5",
    copyButton: "top-3 right-3 p-2",
    copyIcon: "size-6",
  },
} as const;

const springValues: SpringOptions = {
  damping: 25,
  stiffness: 120,
  mass: 1,
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

export const BookCard = memo(function BookCard({
  book,
  size = "M",
}: BookCardProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const styles = sizeStyles[size];
  const { openModal } = useModalActions();
  const cardRef = useRef<HTMLButtonElement>(null);
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const utils = api.useUtils();
  const [copied, setCopied] = useState(false);

  // Detect touch device to skip 3D transforms (reduces GPU load on mobile)
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      "ontouchstart" in window || navigator.maxTouchPoints > 0,
    );
  }, []);

  // Motion values for 3D tilt effect (only used on non-touch devices)
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const rotateAmplitude = tiltAmplitude[size]; // Degrees of rotation

  // Preserve current query params when navigating to book detail
  const bookUrl = getBookPath(book.id, searchParams.toString());

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    posthog.capture("book_link_copied", {
      book_id: book.id,
      book_title: book.title,
    });
    const fullUrl = `${window.location.origin}${getBookPath(book.id)}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClick = () => {
    // Remove focus to prevent Safari focus ring
    cardRef.current?.blur();
    // Open modal instantly via state
    openModal(book, size);
    // Update URL without triggering Next.js navigation
    window.history.pushState(null, "", bookUrl);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Skip 3D tilt calculations on touch devices (reduces GPU load)
    if (isTouchDevice || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);
  };

  const handleMouseEnter = () => {
    // Skip scale animation on touch devices
    if (!isTouchDevice) {
      scale.set(hoverScale[size]);
    }
    // Prefetch book data with notes on hover for faster modal load
    void utils.books.getById.prefetch({ bookId: book.id });
  };

  const handleMouseLeave = () => {
    // Skip animation reset on touch devices
    if (isTouchDevice) return;
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        `group relative block w-full cursor-pointer text-left outline-none ring-0 hover:z-10 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 intersect:motion-scale-in-90 intersect:motion-opacity-in-50`,
        sizeRadius[size],
        // Only enable 3D perspective on non-touch devices
        !isTouchDevice && "[perspective:1000px]",
      )}
      aria-label={`View details for ${book.title} by ${book.author}`}
      style={{
        // Only enable 3D transform style on non-touch devices
        transformStyle: isTouchDevice ? undefined : "preserve-3d",
        outline: "none",
      }}
    >
      <motion.div
        className={!isTouchDevice ? "[transform-style:preserve-3d]" : undefined}
        style={
          isTouchDevice
            ? undefined
            : {
                rotateX,
                rotateY,
                scale,
                willChange: "transform",
                transform: "translateZ(0)",
              }
        }
        whileTap={{ scale: 0.95 }}
      >
        <div
          className={`relative overflow-hidden ${sizeRadius[size]} shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] transition-shadow duration-300 hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] focus:outline-none`}
        >
          {/* Cover Image (aspect ratio 2:3) */}
          <motion.div
            layoutId={`book-cover-${book.id}`}
            className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-b from-stone-500/20 to-stone-700/20"
            transition={{
              layout: { type: "spring", stiffness: 300, damping: 30 },
            }}
          >
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={`${book.title} cover`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <p
                  className={`line-clamp-3 font-bold text-foreground ${styles.placeholderTitle}`}
                >
                  {book.title}
                </p>
                <p
                  className={`mt-1 line-clamp-2 text-muted-foreground ${styles.placeholderAuthor}`}
                >
                  {book.author}
                </p>
                {book.publicationYear && (
                  <p
                    className={`mt-px text-muted-foreground/70 ${styles.placeholderAuthor}`}
                  >
                    {book.publicationYear}
                  </p>
                )}
              </div>
            )}
          </motion.div>

          {/* Currently Reading Badge (takes priority over No Notes) */}
          {isCurrentlyReading(book) ? (
            <Badge
              variant="secondary"
              className={`absolute gap-1 bg-blue-50/90 text-blue-600/80 shadow-md dark:bg-blue-950/90 dark:text-blue-400/90 ${styles.badgeSpacing}`}
            >
              <BookOpen className={styles.badgeIcon} />
              <span className={styles.badgeText}>Reading</span>
            </Badge>
          ) : (
            /* No Notes Badge */
            !book.hasNotes && (
              <Badge
                variant="secondary"
                className={`absolute gap-1 bg-red-50/90 text-red-600/80 shadow-md dark:bg-red-950/90 dark:text-red-400/90 ${styles.badgeSpacing}`}
              >
                <FileText className={styles.badgeIcon} />
                <span className={styles.badgeText}>No Notes</span>
              </Badge>
            )
          )}

          {/* Overlay with title/author on hover */}
          <div
            className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-stone-900/80 via-stone-900/60 via-30% to-transparent to-60% opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${styles.overlayPadding}`}
          >
            {/* Copy link button */}
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                `absolute rounded-full bg-stone-900/30 text-white transition-all duration-300 hover:bg-stone-900/50 focus:outline-none focus-visible:outline-none active:scale-95 ${styles.copyButton}`,
                copied && "bg-green-500/60 hover:bg-green-500/80",
              )}
              aria-label="Copy link to book"
            >
              {copied ? (
                <CheckIcon className={styles.copyIcon} weight="bold" />
              ) : (
                <LinkIcon className={styles.copyIcon} weight="bold" />
              )}
            </button>
            <h3
              className={`line-clamp-3 font-bold leading-tight text-white drop-shadow-md ${styles.overlayTitle}`}
            >
              {book.title}
            </h3>
            <p
              className={`line-clamp-1 pt-0.5 text-white/80 drop-shadow-md ${styles.overlayAuthor}`}
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
        </div>
      </motion.div>
    </button>
  );
});
