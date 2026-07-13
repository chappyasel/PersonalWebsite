"use client";

import { useModalActions } from "../contexts/BookPreviewContext";
import {
  formatLength,
  formatReadDates,
  formatSingleReadDate,
} from "../lib/format";
import { LinkIcon } from "@phosphor-icons/react";
import { ArrowsClockwiseIcon, BookOpenIcon, FileTextIcon } from "@phosphor-icons/react";
import { CheckIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import {
  type SpringOptions,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
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
  size?: "XS" | "S" | "M" | "L";
  isKeyboardFocused?: boolean;
  keyboardCopyTrigger?: number;
  onHover?: (bookId: string | null) => void;
};

const sizeRadius = {
  XS: "rounded-md",
  S: "rounded-lg",
  M: "rounded-xl",
  L: "rounded-2xl",
} as const;

const sizeStyles = {
  XS: {
    placeholderTitle: "text-[8px]",
    placeholderAuthor: "text-[7px]",
    badgeText: "hidden",
    badgeIcon: "h-2 w-2",
    overlayTitle: "hidden",
    overlayAuthor: "hidden",
    star: "hidden",
    badgeSpacing: "top-1 left-1",
    overlayPadding: "p-1",
    copyButton: "top-1 right-1 p-0.5",
    copyIcon: "size-2.5",
    floatZ: 5, // px - parallax float height for 3D effect
    hideOverlays: true, // Special flag to hide all overlays
  },
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
    floatZ: 10, // px - parallax float height for 3D effect
    hideOverlays: false,
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
    floatZ: 20, // px - parallax float height for 3D effect
    hideOverlays: false,
  },
  L: {
    placeholderTitle: "text-base",
    placeholderAuthor: "text-lg",
    badgeText: "text-sm",
    badgeIcon: "h-3.5 w-3.5",
    overlayTitle: "text-lg",
    overlayAuthor: "text-sm",
    star: "!size-5",
    badgeSpacing: "top-3 left-3",
    overlayPadding: "p-8",
    copyButton: "top-3 right-3 p-2",
    copyIcon: "size-6",
    floatZ: 30, // px - parallax float height for 3D effect
    hideOverlays: false,
  },
} as const;

const springValues: SpringOptions = {
  damping: 25,
  stiffness: 120,
  mass: 1,
};

const hoverScale = {
  XS: 1.2, // Largest scale for extra small books
  S: 1.15, // Larger scale for small books
  M: 1.1, // Medium scale
  L: 1.05, // Smaller scale for large books
} as const;

const tiltAmplitude = {
  XS: 0, // No tilt for XS (too small)
  S: 20, // More tilt for small books
  M: 15, // Medium tilt
  L: 10, // Less tilt for large books
} as const;

export const BookCard = memo(function BookCard({
  book,
  size = "M",
  isKeyboardFocused = false,
  keyboardCopyTrigger = 0,
  onHover,
}: BookCardProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const styles = sizeStyles[size];
  const readDates = isCurrentlyReading(book)
    ? `Reading since ${formatSingleReadDate(book.started!)}`
    : (formatReadDates(book.started, book.finished) ??
      (book.finished ? formatSingleReadDate(book.finished) : null));
  const length = formatLength(book.audioLengthMin, book.pageCount);
  const actions = useModalActions();
  const { openModal } = actions;
  const cardRef = useRef<HTMLButtonElement>(null);
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const utils = api.useUtils();
  const [copied, setCopied] = useState(false);
  const [isHoveringCopyZone, setIsHoveringCopyZone] = useState(false);

  // Detect touch device to skip 3D transforms (reduces GPU load on mobile)
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  // Track copy trigger at focus start to detect new copies vs focus changes
  const focusStartTriggerRef = useRef<number>(0);

  // Record trigger value when becoming focused
  useEffect(() => {
    if (isKeyboardFocused) {
      focusStartTriggerRef.current = keyboardCopyTrigger;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKeyboardFocused]); // Intentionally exclude keyboardCopyTrigger

  // Only animate if trigger increased SINCE we became focused
  useEffect(() => {
    if (!isKeyboardFocused || keyboardCopyTrigger === 0) return;
    if (keyboardCopyTrigger > focusStartTriggerRef.current) {
      focusStartTriggerRef.current = keyboardCopyTrigger;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [keyboardCopyTrigger, isKeyboardFocused]);

  // Motion values for 3D tilt effect (only used on non-touch devices)
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const rotateAmplitude = tiltAmplitude[size]; // Degrees of rotation

  // Preserve current query params when navigating to book detail
  const bookUrl = getBookPath(book.id, searchParams.toString());

  const handleCopyLink = () => {
    posthog.capture("book_link_copied", {
      book_id: book.id,
      book_title: book.title,
    });
    const fullUrl = `${window.location.origin}${getBookPath(book.id)}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Check if click is in the top-right corner (copy button zone)
  const isInCopyZone = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cardRef.current) return false;
    const rect = cardRef.current.getBoundingClientRect();

    // Get click/touch position
    let clientX: number, clientY: number;
    if ("touches" in e && e.touches.length > 0 && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return false;
    }

    // Define hit zone size based on card size (generous tap target)
    // XS has no copy button (hideOverlays), so disable the zone entirely
    const zoneSize =
      size === "XS" ? 0 : size === "S" ? 32 : size === "M" ? 40 : 48;

    const isInRightEdge = clientX > rect.right - zoneSize;
    const isInTopEdge = clientY < rect.top + zoneSize;

    return isInRightEdge && isInTopEdge;
  };

  const handleClick = (e: React.MouseEvent) => {
    // Check if click is in the copy button zone
    if (isInCopyZone(e)) {
      handleCopyLink();
      return;
    }

    // Remove focus to prevent Safari focus ring
    cardRef.current?.blur();
    // Open modal instantly via state (XS maps to S for modal)
    openModal(book, size === "XS" ? "S" : size);
    // Update URL without triggering Next.js navigation
    window.history.pushState(null, "", bookUrl);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Track if mouse is in copy zone for hover state
    setIsHoveringCopyZone(isInCopyZone(e));

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
    // Track hover for keyboard navigation starting position
    onHover?.(book.id);
    // Skip scale animation on touch devices
    if (!isTouchDevice) {
      scale.set(hoverScale[size]);
    }
    // Prefetch book data with notes on hover for faster modal load
    void utils.books.getById.prefetch({ bookId: book.id });
  };

  const handleMouseLeave = () => {
    onHover?.(null);
    setIsHoveringCopyZone(false);
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
        `group relative block w-full cursor-pointer text-left outline-none ring-0 hover:z-20 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 intersect:motion-scale-in-90 intersect:motion-opacity-in-50`,
        sizeRadius[size],
        // Only enable 3D perspective on non-touch devices
        !isTouchDevice && "[perspective:1000px]",
        // Keyboard focus - just z-index, ring is on inner element
        isKeyboardFocused && "z-10",
      )}
      aria-label={`View details for ${book.title} by ${book.author}`}
      data-book-id={book.id}
      style={{
        // Only enable 3D transform style on non-touch devices
        transformStyle: isTouchDevice ? undefined : "preserve-3d",
        outline: "none",
      }}
    >
      <motion.div
        className={cn(
          "relative",
          !isTouchDevice && "[transform-style:preserve-3d]",
        )}
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
        {/* Cover container with shadow and rounded corners */}
        <div
          className={cn(
            `relative overflow-hidden shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] transition-shadow duration-300 hover:shadow-[0px_5px_30px_0px_rgba(0,0,0,0.14)] focus:outline-none`,
            sizeRadius[size],
            // Keyboard focus indicator - on inner element so it lifts with 3D transform
            isKeyboardFocused &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
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
                className="h-full w-full select-none object-cover"
                draggable="false"
                onDragStart={(e) => e.preventDefault()}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <p
                  className={`line-clamp-3 font-semibold text-foreground ${styles.placeholderTitle}`}
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
        </div>

        {/* Floating elements - outside overflow-hidden for parallax effect */}
        {/* Hide all overlays for XS size */}
        {!styles.hideOverlays && (
          <>
            {/* Badges container - stacked vertically */}
            <div
              className={cn(
                "absolute flex flex-col items-start gap-1",
                styles.badgeSpacing,
              )}
              style={
                isTouchDevice
                  ? undefined
                  : { transform: `translateZ(${styles.floatZ}px)` }
              }
            >
              {isCurrentlyReading(book) && (
                <Badge
                  variant="secondary"
                  className={cn(
                    `gap-1 bg-blue-50/90 text-blue-600/80 shadow-md dark:bg-blue-950/90 dark:text-blue-400/90`,
                    sizeRadius[size],
                  )}
                >
                  <BookOpenIcon className={styles.badgeIcon} />
                  <span className={styles.badgeText}>Reading</span>
                </Badge>
              )}
              {book.readNumber > 1 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    `gap-1 bg-purple-50/90 text-purple-600/80 shadow-md dark:bg-purple-950/90 dark:text-purple-400/90`,
                    sizeRadius[size],
                  )}
                >
                  <ArrowsClockwiseIcon className={styles.badgeIcon} />
                  <span className={styles.badgeText}>
                    {book.readNumber === 2
                      ? "2nd Read"
                      : book.readNumber === 3
                        ? "3rd Read"
                        : `${book.readNumber}th Read`}
                  </span>
                </Badge>
              )}
              {!isCurrentlyReading(book) && book.readNumber <= 1 && !book.hasNotes && (
                <Badge
                  variant="secondary"
                  className={cn(
                    `gap-1 bg-red-50/90 text-red-600/80 shadow-md dark:bg-red-950/90 dark:text-red-400/90`,
                    sizeRadius[size],
                  )}
                >
                  <FileTextIcon className={styles.badgeIcon} />
                  <span className={styles.badgeText}>No Notes</span>
                </Badge>
              )}
            </div>

            {/* Gradient overlay - does not float */}
            <div
              className={cn(
                `pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/60 via-30% to-transparent to-60% transition-opacity duration-500 group-hover:opacity-100`,
                sizeRadius[size],
                isKeyboardFocused ? "opacity-100" : "opacity-0",
              )}
            />

            {/* Text overlay - floats above */}
            <div
              className={cn(
                `pointer-events-none absolute inset-0 flex flex-col justify-end transition-opacity duration-500 group-hover:opacity-100`,
                styles.overlayPadding,
                sizeRadius[size],
                isKeyboardFocused ? "opacity-100" : "opacity-0",
              )}
              style={
                isTouchDevice
                  ? undefined
                  : { transform: `translateZ(${styles.floatZ * 1.5}px)` }
              }
            >
              <h3
                className={`line-clamp-3 font-semibold leading-tight text-white drop-shadow-md ${styles.overlayTitle}`}
              >
                {book.title}
              </h3>
              <p
                className={`line-clamp-1 pt-0.5 text-white/80 drop-shadow-md ${styles.overlayAuthor}`}
              >
                {book.author}
                {book.publicationYear ? ` (${book.publicationYear})` : ""}
              </p>
              {readDates && (
                <p
                  className={`line-clamp-1 pt-0.5 text-white/60 drop-shadow-md ${styles.overlayAuthor}`}
                >
                  {readDates}
                </p>
              )}
              {length && (
                <p
                  className={`line-clamp-1 text-white/60 drop-shadow-md ${styles.overlayAuthor}`}
                >
                  {length}
                </p>
              )}
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

            {/* Copy link icon - visual indicator, clicks detected via position */}
            <div
              className={cn(
                `pointer-events-none absolute rounded-full bg-stone-900/30 text-white transition-all duration-200 group-hover:opacity-100 ${styles.copyButton}`,
                copied && "bg-green-500/60",
                isHoveringCopyZone && !copied && "scale-110 bg-stone-900/50",
                isKeyboardFocused ? "opacity-100" : "opacity-0",
              )}
              style={
                isTouchDevice
                  ? undefined
                  : { transform: `translateZ(${styles.floatZ * 0.5}px)` }
              }
            >
              {copied ? (
                <CheckIcon className={styles.copyIcon} weight="bold" />
              ) : (
                <LinkIcon className={styles.copyIcon} weight="bold" />
              )}
            </div>
          </>
        )}
      </motion.div>
    </button>
  );
});
