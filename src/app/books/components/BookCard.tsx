"use client";

import { useModalActions } from "../contexts/BookPreviewContext";
import { useBookPath } from "../hooks/useBookPath";
import {
  formatLength,
  formatReadDates,
  formatSingleReadDate,
} from "../lib/format";
import { LinkIcon } from "@phosphor-icons/react";
import {
  ArrowsClockwiseIcon,
  BookOpenIcon,
  BookmarkSimpleIcon,
  FileTextIcon,
} from "@phosphor-icons/react";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  HeadphonesIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { capture } from "~/lib/analytics";
import { bookCardPalette } from "~/lib/books/cardPalette";
import { bookCardVisualEffects } from "~/lib/books/cardVisualEffects";
import {
  bookHoverSpring,
  bookHoverScale as hoverScale,
  bookTiltAmplitude as tiltAmplitude,
} from "~/lib/books/coverMotion";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import {
  abandonedPercent,
  isCurrentlyReading,
  readingStatus,
} from "~/lib/books/types";
import type { Book } from "~/lib/books/types";
import { api } from "~/trpc/react";

import { BookMetadataSeparator } from "~/components/books/BookMetadataSeparator";
import { loadFullPageOnSmallViewport } from "~/components/modal-sheet/sheetRoute";
import { Badge } from "~/components/ui/badge";
import { useIntersectionMotion } from "~/components/ui/intersection-motion";

import cardStyles from "./BookCard.module.css";
import { BookCoverSurface } from "./BookCoverSurface";
import { BOOK_MODAL_HISTORY_STATE } from "./modalHistory";
import { cn } from "@/src/lib/util";
import {
  cardInteractionSpring,
  cardPressedScale,
} from "~/app/components/tiltCardMotion";

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

const coverSizes = {
  XS: "(max-width: 640px) 12vw, 64px",
  S: "(max-width: 640px) calc(50vw - 2rem), 110px",
  M: "(max-width: 640px) calc(50vw - 2rem), 170px",
  L: "(max-width: 640px) calc(50vw - 2rem), 260px",
} as const;

const sizeStyles = {
  XS: {
    placeholderTitle: "text-[8px]",
    placeholderAuthor: "text-[7px]",
    badgeText: "hidden",
    overlayTitle: "hidden",
    overlayAuthor: "hidden",
    overlayFact: "hidden",
    star: "hidden",
    cornerInset: "0.375rem",
    overlayPadding: "0.25rem",
    copyButton: "p-0.5",
    copyIcon: "size-2.5",
    floatZ: 5, // px - parallax float height for 3D effect
    hideOverlays: true, // Special flag to hide all overlays
  },
  S: {
    placeholderTitle: "text-xs",
    placeholderAuthor: "text-[10px]",
    badgeText: "text-[10px]",
    overlayTitle: "text-sm",
    overlayAuthor: "text-[11px]",
    overlayFact: "text-[10px]",
    star: "!size-3.5",
    cornerInset: "0.5rem",
    overlayPadding: "0.75rem",
    copyButton: "p-1",
    copyIcon: "size-3.5",
    floatZ: 10, // px - parallax float height for 3D effect
    hideOverlays: false,
  },
  M: {
    placeholderTitle: "text-sm",
    placeholderAuthor: "text-xs",
    badgeText: "text-[11px]",
    overlayTitle: "text-base",
    overlayAuthor: "text-xs",
    overlayFact: "text-[11px]",
    star: "!size-4",
    cornerInset: "0.625rem",
    overlayPadding: "1rem",
    copyButton: "p-1.5",
    copyIcon: "size-5",
    floatZ: 20, // px - parallax float height for 3D effect
    hideOverlays: false,
  },
  L: {
    placeholderTitle: "text-base",
    placeholderAuthor: "text-lg",
    badgeText: "text-xs",
    overlayTitle: "text-xl",
    overlayAuthor: "text-sm",
    overlayFact: "text-xs",
    star: "!size-5",
    cornerInset: "0.875rem",
    overlayPadding: "2rem",
    copyButton: "p-2",
    copyIcon: "size-6",
    floatZ: 30, // px - parallax float height for 3D effect
    hideOverlays: false,
  },
} as const;

export const BookCard = memo(function BookCard({
  book,
  size = "M",
  isKeyboardFocused = false,
  keyboardCopyTrigger = 0,
  onHover,
}: BookCardProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const palette = bookCardPalette(book.coverColor);
  const visualEffects = useSyncExternalStore(
    bookCardVisualEffects.subscribe,
    bookCardVisualEffects.getSnapshot,
    bookCardVisualEffects.getServerSnapshot,
  );
  const styles = sizeStyles[size];
  const status = readingStatus(book);
  const readDates =
    status === "reading"
      ? `Started ${formatSingleReadDate(book.started!)}`
      : status === "abandoned"
        ? (formatReadDates(book.started, book.abandoned) ??
          (book.abandoned ? formatSingleReadDate(book.abandoned) : null))
        : (formatReadDates(book.started, book.finished) ??
          (book.finished ? formatSingleReadDate(book.finished) : null));
  const length = formatLength(book.audioLengthMin, book.pageCount);
  const [audioLength, pageLength] = length?.split(" · ") ?? [];
  const ReadingIcon =
    status === "reading"
      ? CalendarIcon
      : status === "abandoned"
        ? BookmarkSimpleIcon
        : book.readNumber > 1
          ? ArrowsClockwiseIcon
          : ClockIcon;
  const actions = useModalActions();
  const { openModal } = actions;
  const cardRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const overlayBodyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useIntersectionMotion(cardRef);
  const searchParams = useSearchParams();
  const bookPath = useBookPath();
  const utils = api.useUtils();
  const [copied, setCopied] = useState(false);
  const [isHoveringCopyZone, setIsHoveringCopyZone] = useState(false);

  // Detect touch device to skip 3D transforms (reduces GPU load on mobile)
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  // Match the glass to the untransformed text height without putting the text
  // inside overflow-hidden, which would flatten its depth against the jacket.
  useEffect(() => {
    const card = cardRef.current;
    const body = overlayBodyRef.current;
    if (!card || !body) return;
    const syncHeight = () => {
      card.style.setProperty("--book-overlay-height", `${body.offsetHeight}px`);
    };
    syncHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncHeight);
    observer.observe(body);
    return () => observer.disconnect();
  }, [styles.hideOverlays]);

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
  const rotateX = useSpring(useMotionValue(0), bookHoverSpring);
  const rotateY = useSpring(useMotionValue(0), bookHoverSpring);
  const scale = useSpring(1, bookHoverSpring);

  const rotateAmplitude = tiltAmplitude[size]; // Degrees of rotation

  // Preserve current query params when navigating to book detail
  const bookUrl = bookPath(book.id, searchParams.toString());

  const handleCopyLink = () => {
    capture("book_link_copied", {
      book_id: book.id,
      book_title: book.title,
    });
    const fullUrl = `${window.location.origin}${bookPath(book.id)}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Follow the visible control as the card tilts and scales.
  const isInCopyZone = (e: React.MouseEvent | React.TouchEvent) => {
    if (styles.hideOverlays || !copyRef.current) return false;
    const rect = copyRef.current.getBoundingClientRect();

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

    const padding = "touches" in e ? 8 : 4;
    return (
      clientX >= rect.left - padding &&
      clientX <= rect.right + padding &&
      clientY >= rect.top - padding &&
      clientY <= rect.bottom + padding
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    // Check if click is in the copy button zone
    if (e.detail > 0 && isInCopyZone(e)) {
      handleCopyLink();
      return;
    }

    // Remove focus to prevent Safari focus ring
    cardRef.current?.blur();
    // On a phone the book is its own page, not a modal over the shelf
    // (components/modal-sheet/sheetRoute).
    if (loadFullPageOnSmallViewport(bookUrl, { source: cardRef.current }))
      return;
    // Open modal instantly via state (XS maps to S for modal)
    openModal(book, size === "XS" ? "S" : size);
    // Update URL without triggering Next.js navigation
    window.history.pushState(BOOK_MODAL_HISTORY_STATE, "", bookUrl);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Track if mouse is in copy zone for hover state
    setIsHoveringCopyZone(isInCopyZone(e));

    // Skip 3D tilt calculations on touch devices (reduces GPU load)
    if (isTouchDevice || reduceMotion || !cardRef.current) return;

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
    if (!isTouchDevice && !reduceMotion) {
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
        `intersect-once group relative block w-full cursor-pointer text-left outline-none ring-0 hover:z-20 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 intersect:motion-scale-in-90 intersect:motion-opacity-in-50`,
        cardStyles.card,
        sizeRadius[size],
        // Only enable 3D perspective on non-touch devices
        !isTouchDevice && "[perspective:1000px]",
        // Keyboard focus - just z-index, ring is on inner element
        isKeyboardFocused && "z-10",
      )}
      aria-label={`View details for ${book.title} by ${book.author}`}
      data-book-id={book.id}
      data-keyboard-focused={isKeyboardFocused}
      data-cover-tone={palette.tone}
      style={
        {
          "--book-wash": palette.washRgb,
          "--book-wash-opacity": palette.washOpacity,
          "--book-overlay-padding": styles.overlayPadding,
          "--book-corner-inset": styles.cornerInset,
          "--book-text-depth": `${isTouchDevice || reduceMotion ? 0 : styles.floatZ * 1.5}px`,
          "--book-foreground": palette.foreground,
          "--book-secondary": palette.secondary,
          // Only enable 3D transform style on non-touch devices
          transformStyle: isTouchDevice ? undefined : "preserve-3d",
          outline: "none",
        } as CSSProperties
      }
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
        whileTap={reduceMotion ? undefined : { scale: cardPressedScale }}
        transition={{ type: "spring", ...cardInteractionSpring }}
      >
        {/* Cover container with shadow and rounded corners */}
        <BookCoverSurface
          motion={
            isTouchDevice || reduceMotion
              ? undefined
              : { rotateX, rotateY, scale }
          }
          className={cn(
            `relative overflow-hidden focus:outline-none`,
            cardStyles.coverFrame,
            sizeRadius[size],
            // Keyboard focus indicator - on inner element so it lifts with 3D transform
            isKeyboardFocused &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          {/* Cover Image (aspect ratio 2:3) */}
          <motion.div
            layoutId={`book-cover-${book.id}`}
            className={cn(
              "relative aspect-[2/3] w-full overflow-hidden",
              // The jacket's own color holds the slot until the image lands;
              // books without a sampled color keep the neutral gradient.
              !book.coverColor &&
                "bg-gradient-to-b from-stone-500/20 to-stone-700/20",
            )}
            style={
              book.coverColor ? { backgroundColor: book.coverColor } : undefined
            }
            transition={{
              layout: { type: "spring", stiffness: 300, damping: 30 },
            }}
          >
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={`${book.title} cover`}
                fill
                sizes={coverSizes[size]}
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
                    className={`mt-px text-muted-foreground ${styles.placeholderAuthor}`}
                  >
                    {book.publicationYear}
                  </p>
                )}
              </div>
            )}
            {!styles.hideOverlays && (
              // Cover and glass share the same flat plane and rounded clip.
              <div className={cardStyles.overlay}>
                <div className={cn(cardStyles.body, cardStyles.materialBody)}>
                  {visualEffects.backdropBlur && (
                    <>
                      <div
                        aria-hidden="true"
                        className={cn(
                          cardStyles.glass,
                          cardStyles.soft,
                          styles.overlayTitle,
                        )}
                      />
                      <div
                        aria-hidden="true"
                        className={cn(
                          cardStyles.glass,
                          cardStyles.medium,
                          styles.overlayTitle,
                        )}
                      />
                      <div
                        aria-hidden="true"
                        className={cn(
                          cardStyles.glass,
                          cardStyles.deep,
                          styles.overlayTitle,
                        )}
                      />
                    </>
                  )}
                  <div aria-hidden="true" className={cardStyles.wash} />
                </div>
              </div>
            )}
          </motion.div>
        </BookCoverSurface>

        {/* Floating elements - outside overflow-hidden for parallax effect */}
        {/* Hide all overlays for XS size */}
        {!styles.hideOverlays && (
          <>
            <div className={cn(cardStyles.overlay, cardStyles.floatingText)}>
              <div ref={overlayBodyRef} className={cardStyles.body}>
                <div className={cardStyles.text}>
                  <h3
                    className={`line-clamp-3 font-semibold leading-tight ${styles.overlayTitle}`}
                  >
                    {book.title}
                  </h3>
                  <p
                    className={cn(
                      `flex min-w-0 items-baseline pt-0.5 font-normal ${styles.overlayAuthor}`,
                      cardStyles.secondary,
                    )}
                  >
                    <span className="min-w-0 truncate">{book.author}</span>
                    {book.publicationYear && (
                      <span className="shrink-0 whitespace-nowrap">
                        <BookMetadataSeparator />
                        <span aria-label={`Published ${book.publicationYear}`}>
                          {book.publicationYear}
                        </span>
                      </span>
                    )}
                  </p>
                  {length && (
                    <p
                      data-book-fact="length"
                      aria-label={`Length: ${length}`}
                      className={cn(
                        `mt-2 ${styles.overlayFact}`,
                        cardStyles.fact,
                      )}
                    >
                      <HeadphonesIcon
                        aria-hidden="true"
                        weight="bold"
                        className={cardStyles.factIcon}
                      />
                      <span className="min-w-0 truncate">
                        {pageLength ? (
                          <>
                            {audioLength}
                            <BookMetadataSeparator />
                            {pageLength}
                          </>
                        ) : (
                          length
                        )}
                      </span>
                    </p>
                  )}
                  {readDates && (
                    <p
                      data-book-fact="read"
                      aria-label={
                        status === "reading"
                          ? readDates
                          : `${status === "abandoned" ? "Abandoned" : "Read"}: ${readDates}`
                      }
                      className={cn(
                        styles.overlayFact,
                        length ? "mt-1" : "mt-2",
                        cardStyles.fact,
                      )}
                    >
                      <ReadingIcon
                        aria-hidden="true"
                        weight="bold"
                        className={cardStyles.factIcon}
                      />
                      <span className="min-w-0 truncate">{readDates}</span>
                    </p>
                  )}
                  {book.rating && (
                    <div
                      role="img"
                      aria-label={`${book.rating} out of 5 stars`}
                      className="mt-2 flex gap-0.5"
                    >
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon
                          key={i}
                          aria-hidden="true"
                          weight={i < book.rating! ? "fill" : "duotone"}
                          style={
                            i < book.rating! && palette.starOverride
                              ? { color: palette.starOverride }
                              : undefined
                          }
                          className={cn(
                            styles.star,
                            i < book.rating!
                              ? "text-yellow-400"
                              : cardStyles.emptyStar,
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Badges container - stacked vertically */}
            <div
              className={cn(
                "absolute flex flex-col items-start gap-1",
                cardStyles.badges,
              )}
            >
              {isCurrentlyReading(book) && (
                <Badge
                  variant="outline"
                  className={cn(cardStyles.badge, styles.badgeText)}
                >
                  <BookOpenIcon aria-hidden="true" weight="bold" />
                  <span>Reading</span>
                </Badge>
              )}
              {status === "abandoned" && (
                <Badge
                  variant="outline"
                  className={cn(cardStyles.badge, styles.badgeText)}
                >
                  <BookmarkSimpleIcon aria-hidden="true" weight="bold" />
                  <span>
                    {abandonedPercent(book) != null
                      ? `Abandoned ${abandonedPercent(book)}%`
                      : "Abandoned"}
                  </span>
                </Badge>
              )}
              {book.readNumber > 1 && (
                <Badge
                  variant="outline"
                  className={cn(cardStyles.badge, styles.badgeText)}
                >
                  <ArrowsClockwiseIcon aria-hidden="true" weight="bold" />
                  <span>
                    {book.readNumber === 2
                      ? "2nd Read"
                      : book.readNumber === 3
                        ? "3rd Read"
                        : `${book.readNumber}th Read`}
                  </span>
                </Badge>
              )}
              {!book.hasNotes && (
                <Badge
                  variant="outline"
                  data-book-badge="no-notes"
                  className={cn(cardStyles.badge, styles.badgeText)}
                >
                  <FileTextIcon aria-hidden="true" weight="bold" />
                  <span>No Notes</span>
                </Badge>
              )}
            </div>

            {/* Copy link icon - visual indicator, clicks detected via position */}
            <div
              ref={copyRef}
              data-copy-hovered={isHoveringCopyZone}
              data-copy-complete={copied}
              className={cn(
                `pointer-events-none absolute rounded-full ${styles.copyButton}`,
                cardStyles.copy,
              )}
            >
              {/* Keep the original bounds for pointer and touch hit testing. */}
              <span aria-hidden className={`block ${styles.copyIcon}`} />
              <span className={cardStyles.copyVisual}>
                {copied ? (
                  <CheckIcon className={styles.copyIcon} weight="bold" />
                ) : (
                  <LinkIcon className={styles.copyIcon} weight="bold" />
                )}
              </span>
            </div>
          </>
        )}
      </motion.div>
    </button>
  );
});
