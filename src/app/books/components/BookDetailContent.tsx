"use client";

import { formatLength, formatReadDates, getOrdinalSuffix } from "../lib/format";
import {
  ArrowSquareOutIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  BookmarkSimpleIcon,
  BooksIcon,
  CalendarBlankIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  HeadphonesIcon,
  LinkIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  AnimatePresence,
  type MotionValue,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import {
  Children,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { capture, captureOnce } from "~/lib/analytics";
import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { separateCachedQuoteBlocks } from "~/lib/books/markdown";
import { selectBookNotice } from "~/lib/books/notices";
import { getBookPath, getBooksPath } from "~/lib/books/paths";
import type { BaseBook, Book, BookReading } from "~/lib/books/types";
import { abandonedPercent } from "~/lib/books/types";
import { cn } from "~/lib/util";

import {
  SheetCloseControl,
  SheetControlCluster,
  SheetExpandControl,
} from "~/components/modal-sheet/SheetControls";
import { Button } from "~/components/ui/button";
import { DisclosureCaret, DisclosurePanel } from "~/components/ui/disclosure";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { BookNotesLoadingSkeleton } from "./BookDetailLoadingSkeleton";
import {
  AbandonedNotice,
  AutomatedNotice,
  NoNotesState,
  ReadingNowNotice,
} from "./BookNotices";
import { InlineMarkdown } from "./InlineMarkdown";
import { TagBadge } from "./TagBadge";

/**
 * Where you are, and the way back. Standalone pages keep the library-count
 * breadcrumb; a modal opened over the 3D homepage gets a single outbound link
 * to the dedicated Books site — no back arrow, since inside a modal that reads
 * as dismiss; modals already on Books get neither, so the same navigation is
 * never repeated in its own app.
 *
 * The wide layout renders this inside the title column rather than across the
 * top of the card, so the line that says where you are sits over the thing it
 * names instead of over the cover.
 */
function BookBreadcrumb({
  modalBreadcrumbHref,
  modalBookCount,
  bookshelfBookCount,
  marginBottom,
  className,
}: {
  modalBreadcrumbHref?: string;
  modalBookCount?: number;
  bookshelfBookCount?: number;
  marginBottom: MotionValue<string>;
  className?: string;
}) {
  return (
    <motion.nav
      aria-label={modalBreadcrumbHref ? "Chappy's Book Notes" : "Breadcrumb"}
      data-stacks-book-breadcrumb={modalBreadcrumbHref ? "external" : undefined}
      className={cn("text-sm text-muted-foreground/70", className)}
      style={{ marginBottom }}
    >
      {modalBreadcrumbHref ? (
        <a
          href={modalBreadcrumbHref}
          className="inline-flex min-w-0 items-center gap-1.5 transition-colors hover:text-muted-foreground"
        >
          <BooksIcon aria-hidden size={16} weight="bold" className="shrink-0" />
          <span className="xs:hidden">Book Notes</span>
          <span className="hidden xs:inline">Chappy&apos;s Book Notes</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
          <span className="shrink-0 tabular-nums">
            {modalBookCount?.toLocaleString() ?? "All"}
            <span className="hidden xs:inline"> books</span>
          </span>
          <ArrowUpRightIcon
            aria-hidden
            size={14}
            weight="bold"
            className="shrink-0"
          />
        </a>
      ) : (
        <ol className="flex min-w-0 items-center">
          <li className="min-w-0">
            <Link
              href={getBooksPath()}
              className="inline-flex min-w-0 items-center gap-1.5 transition-colors hover:text-muted-foreground"
            >
              <BooksIcon
                aria-hidden
                size={16}
                weight="bold"
                className="shrink-0"
              />
              <span>Chappy&apos;s Book Notes</span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span className="shrink-0 tabular-nums">
                {bookshelfBookCount?.toLocaleString() ?? "All"} books
              </span>
              <ArrowUpRightIcon
                aria-hidden
                size={14}
                weight="bold"
                className="shrink-0"
              />
            </Link>
          </li>
        </ol>
      )}
    </motion.nav>
  );
}

// The header's shape follows the scroll through one underdamped spring, so a
// hard stop at either end (hitting the top, or the fold completing under a
// fast flick) carries a small overshoot before it settles: about 6% past the
// target, settled in roughly 270ms.
const HEADER_SPRING = { type: "spring" as const, stiffness: 500, damping: 30 };

/**
 * The header's two sizes in px, per layout, and the scroll distance between
 * them. The header keeps its folded height in the document flow at all
 * times; the rest of its resting silhouette overflows onto a spacer below.
 * So the notes push the header closed at exactly scroll speed, and nothing on
 * the page ever moves faster or slower than the finger, whatever the spring
 * is doing to the header's own shape.
 *
 * Measured folded, wide layout: title + author is 56px, and the subdued crumb
 * adds 22px on top of it (the crumb runs inside the title column, which is
 * why 55px was right while it ran across the card and left the spine
 * floating once it moved). The narrow layout never puts the crumb in the
 * column, so 42px stands either way.
 */
function headerGeometry(
  isLargeScreen: boolean,
  isModal: boolean,
  showBreadcrumb: boolean,
) {
  const cover: [number, number] = isLargeScreen
    ? [300, showBreadcrumb ? 78 : 56]
    : [isModal ? 220 : 200, 42];
  const paddingTop: [number, number] = isLargeScreen
    ? [56, isModal ? 16 : 12]
    : [isModal ? 24 : 16, isModal ? 16 : 12];
  const paddingBottom: [number, number] = isModal ? [16, 16] : [16, 10];
  const expanded = paddingTop[0] + cover[0] + paddingBottom[0];
  const collapsed = paddingTop[1] + cover[1] + paddingBottom[1];
  return {
    cover,
    paddingTop,
    paddingBottom,
    collapsed,
    /** How far the notes scroll while the header folds. */
    shrink: expanded - collapsed,
  };
}

const px = (values: [number, number]) =>
  values.map((value) => `${value}px`) as [string, string];

/**
 * Visibility that follows a fading row to hidden once its opacity reaches
 * zero, so the folded header's action buttons stop taking clicks and focus
 * through the notes. The opacity transforms clamp at their segment ends, so
 * zero is exact rather than asymptotic.
 */
function useHiddenWhenClear(opacity: MotionValue<number>) {
  return useTransform(opacity, (value) => (value > 0 ? "visible" : "hidden"));
}

/** The narrow layout's resting metadata rows, top to bottom. */
const MOBILE_SEGMENTS = [
  "identity",
  "facts",
  "rating",
  "tags",
  "actions",
] as const;
type MobileSegment = (typeof MOBILE_SEGMENTS)[number];

/**
 * How much of a box has slid under the header's bottom edge: 0 while the box
 * is still clear of it, 1 once the whole box is above it. A row this drives
 * dissolves only as it actually goes under, so it can never vanish from a
 * spot the reader is still looking at.
 */
export function underHeader(
  edge: number,
  rect: { top: number; height: number },
) {
  if (rect.height <= 0) return rect.top < edge ? 1 : 0;
  return Math.min(Math.max((edge - rect.top) / rect.height, 0), 1);
}

// One backdrop-filter cannot vary its radius across the element, so the
// graduated edge comes from stacking these layers: each is masked to a band
// that overlaps the next, radii halving downward, and each layer re-blurs the
// composite behind it so the seams between bands disappear. Percentages are of
// the backdrop container (header plus a 3rem overhang past its bottom edge).
// The whole gradient hugs the collapsed header's text: full blur behind the
// title line, falling to zero at the author line's bottom (~half), so content
// any lower is covered by the wash alone and reads crisp the moment it clears
// the header instead of smearing through the overhang. A breadcrumb row above
// the title (the full-page view, and the modal over the 3D homepage) pushes
// the title/author band down, so every stop shifts with it.
function glassLayers(shift: number) {
  return [
    {
      radius: 12,
      mask: `linear-gradient(to bottom, black 0%, black ${35 + shift}%, transparent ${49 + shift}%)`,
    },
    {
      radius: 6,
      mask: `linear-gradient(to bottom, transparent ${33 + shift}%, black ${39 + shift}%, black ${45 + shift}%, transparent ${53 + shift}%)`,
    },
    {
      radius: 2.5,
      mask: `linear-gradient(to bottom, transparent ${43 + shift}%, black ${49 + shift}%, black ${51 + shift}%, transparent ${59 + shift}%)`,
    },
  ] as const;
}

function HeaderGlassBackdrop({
  progress,
  isModal,
  hasBreadcrumb,
}: {
  progress: MotionValue<number>;
  isModal?: boolean;
  hasBreadcrumb?: boolean;
}) {
  const shift = hasBreadcrumb ? 12 : 0;
  const GLASS_LAYERS = glassLayers(shift);
  // The radii animate up from zero (rather than fading a parent's opacity,
  // which would form a backdrop root and stop the layers sampling the page)
  // so the overhang leaves resting content crisp until it actually scrolls.
  const reveal = useTransform(progress, [0.05, 0.35], [0, 1]);
  const radius0 = useTransform(reveal, (v) => v * GLASS_LAYERS[0].radius);
  const radius1 = useTransform(reveal, (v) => v * GLASS_LAYERS[1].radius);
  const radius2 = useTransform(reveal, (v) => v * GLASS_LAYERS[2].radius);
  const filter0 = useMotionTemplate`blur(${radius0}px)`;
  const filter1 = useMotionTemplate`blur(${radius1}px)`;
  const filter2 = useMotionTemplate`blur(${radius2}px)`;
  const layers = [
    { ...GLASS_LAYERS[0], filter: filter0 },
    { ...GLASS_LAYERS[1], filter: filter1 },
    { ...GLASS_LAYERS[2], filter: filter2 },
  ];

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 -bottom-12 top-0 [--glass:var(--background)]",
        isModal && "dark:[--glass:var(--muted)]",
      )}
    >
      {layers.map((layer) => (
        <motion.div
          key={layer.radius}
          className="absolute inset-0"
          style={{
            backdropFilter: layer.filter,
            maskImage: layer.mask,
            WebkitMaskImage: layer.mask,
          }}
        />
      ))}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: reveal,
          background: `linear-gradient(to bottom, hsl(var(--glass) / 0.85) 0%, hsl(var(--glass) / 0.8) ${39 + shift}%, hsl(var(--glass) / 0.45) ${53 + shift}%, transparent ${71 + shift}%)`,
        }}
      />
    </div>
  );
}

/**
 * Process details/summary blocks to ensure markdown inside is rendered
 * Converts <details><summary>X</summary>Y</details> format to a structure
 * where the content is properly processed as markdown
 */
function processDetailsBlocks(markdown: string): string {
  // Match details blocks with their content
  const detailsRegex = /<details>(.*?)<\/details>/gs;

  return markdown.replace(detailsRegex, (match: string, content: string) => {
    // Extract summary and remaining content
    const summaryRegex = /<summary>(.*?)<\/summary>(.*)/s;
    const summaryMatch = summaryRegex.exec(content);

    if (!summaryMatch) {
      return match; // Return original if format is unexpected
    }

    const summaryText = summaryMatch[1]?.trim() ?? "";
    const detailsContent = summaryMatch[2]?.trim() ?? "";

    // Return formatted with newlines so markdown inside gets processed
    return `\n<details>\n<summary>${summaryText}</summary>\n\n${detailsContent}\n\n</details>\n`;
  });
}

type MarkdownSummaryProps = ComponentPropsWithoutRef<"summary"> & {
  node?: unknown;
  /** Set by AnimatedDetails, which owns the open state. */
  open?: boolean;
};

function BookNoteSummary({
  children,
  node: _node,
  open = false,
  className,
  ...props
}: MarkdownSummaryProps) {
  return (
    <span
      {...props}
      className={cn(
        "group/book-note-summary -ml-5 flex cursor-pointer items-start gap-2.5 text-foreground",
        className,
      )}
    >
      <DisclosureCaret
        open={open}
        className="group-hover/book-note-summary:text-foreground"
      />
      <span className="min-w-0 flex-1">
        {Children.map(children, (child) =>
          typeof child === "string" ? <InlineMarkdown source={child} /> : child,
        )}
      </span>
    </span>
  );
}

type AnimatedDetailsProps = ComponentPropsWithoutRef<"details">;

function AnimatedDetails({
  children,
  className,
  open = false,
  ...props
}: AnimatedDetailsProps) {
  const [isOpen, setIsOpen] = useState(open);
  const contentId = useId();
  const childArray = Children.toArray(children);
  const summary = childArray.find(
    (child): child is ReactElement<MarkdownSummaryProps> =>
      isValidElement(child) && child.type === BookNoteSummary,
  );
  const divProps = props as unknown as ComponentPropsWithoutRef<"div">;

  if (!summary) {
    return (
      <div {...divProps} className={className}>
        {children}
      </div>
    );
  }

  const content = childArray.filter((child) => child !== summary);

  return (
    <div
      {...divProps}
      className={cn("my-1.5 pl-[26px]", className)}
      data-expanded={isOpen}
    >
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        className="block w-full appearance-none rounded-sm border-0 bg-transparent p-0 text-left [font:inherit] [line-height:inherit] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setIsOpen((current) => !current)}
      >
        {/* The summary comes from react-markdown, so it learns the state
            here rather than from an ancestor selector, which a nested
            details block would also match. */}
        {cloneElement(summary, { open: isOpen })}
      </button>
      <DisclosurePanel id={contentId} open={isOpen}>
        {content}
      </DisclosurePanel>
    </div>
  );
}

/**
 * Calculate reading duration in days
 */
/**
 * Label for one entry in a multi-attempt reading history. Abandoned attempts
 * are labeled as such and never consume a read number — "2nd Read" counts
 * only completed reads before and including this one.
 */
function readingLabel(readings: BookReading[], index: number): string {
  const reading = readings[index]!;
  if (reading.abandoned && !reading.finished) return "Abandoned:";
  const readNumber = readings
    .slice(0, index + 1)
    .filter((r) => !r.abandoned || r.finished).length;
  return readNumber === 1
    ? "Read:"
    : readNumber === 2
      ? "2nd Read:"
      : readNumber === 3
        ? "3rd Read:"
        : `${readNumber}th Read:`;
}

function getReadingDays(
  started: string | null,
  finished: string | null,
): number | null {
  if (!started || !finished) return null;

  const startDate = new Date(started);
  const endDate = new Date(finished);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatStartedDate(started: string): string {
  const date = new Date(started);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.toLocaleDateString("en-US", { year: "2-digit" });
  return `${month} ${day}${getOrdinalSuffix(day)} '${year}`;
}

function BookFact({
  icon,
  label,
  value,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tooltip?: ReactNode;
}) {
  const valueElement = (
    <dd className="w-fit min-w-0 max-w-full justify-self-start text-xs font-medium tabular-nums leading-4 text-foreground/80 sm:text-sm sm:leading-5">
      {value}
    </dd>
  );

  return (
    <div
      data-book-fact={label.toLowerCase()}
      className="grid min-w-0 cursor-default grid-cols-[1rem_4.25rem_minmax(0,1fr)] items-start gap-x-1.5 sm:grid-cols-[1.125rem_5rem_minmax(0,1fr)]"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-4 items-center justify-center text-muted-foreground/60 sm:h-5"
      >
        {icon}
      </span>
      <dt className="text-xs font-medium leading-4 text-muted-foreground/70 sm:text-sm sm:leading-5">
        {label}
      </dt>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{valueElement}</TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        valueElement
      )}
    </div>
  );
}

function BookFacts({ book }: { book: BookDetailBook }) {
  const facts: ReactNode[] = [];

  if (book.publicationYear) {
    facts.push(
      <BookFact
        key="published"
        icon={<CalendarBlankIcon size={14} weight="bold" />}
        label="Published"
        value={book.publicationYear}
      />,
    );
  }

  if (book.audioLengthMin != null || book.pageCount != null) {
    const formattedLength =
      formatLength(book.audioLengthMin, book.pageCount) ?? "";
    const [audioLength, pageLength] = formattedLength.split(" · ");
    facts.push(
      <BookFact
        key="length"
        icon={<HeadphonesIcon size={14} weight="bold" />}
        label="Length"
        value={
          pageLength ? (
            <>
              {audioLength}{" "}
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>{" "}
              {pageLength}
            </>
          ) : (
            formattedLength
          )
        }
      />,
    );
  }

  if ((book.otherReadings ?? []).length > 1) {
    for (const [index, reading] of (book.otherReadings ?? []).entries()) {
      const end = reading.finished ?? reading.abandoned;
      const days = getReadingDays(reading.started, end);
      facts.push(
        <BookFact
          key={`reading-${index}`}
          icon={
            reading.abandoned && !reading.finished ? (
              <BookmarkSimpleIcon size={14} weight="bold" />
            ) : index > 0 ? (
              <ArrowsClockwiseIcon size={14} weight="bold" />
            ) : (
              <ClockIcon size={14} weight="bold" />
            )
          }
          label={readingLabel(book.otherReadings ?? [], index).replace(
            /:$/,
            "",
          )}
          value={
            reading.started && end
              ? formatReadDates(reading.started, end)
              : reading.started
                ? formatStartedDate(reading.started)
                : "Unknown"
          }
          tooltip={days != null ? `${days} days` : undefined}
        />,
      );
    }
  } else if (book.started && book.finished) {
    const days = getReadingDays(book.started, book.finished);
    facts.push(
      <BookFact
        key="read"
        icon={<ClockIcon size={14} weight="bold" />}
        label="Read"
        value={formatReadDates(book.started, book.finished)}
        tooltip={days != null ? `${days} days` : undefined}
      />,
    );
  } else if (book.abandoned) {
    const days = getReadingDays(book.started, book.abandoned);
    const percent = abandonedPercent(book);
    facts.push(
      <BookFact
        key="abandoned"
        icon={<BookmarkSimpleIcon size={14} weight="bold" />}
        label="Abandoned"
        value={formatReadDates(book.started, book.abandoned)}
        tooltip={
          days != null ? (
            <>
              {days} days{percent != null ? ` · stopped ${percent}% in` : ""}
            </>
          ) : undefined
        }
      />,
    );
  } else if (book.started) {
    facts.push(
      <BookFact
        key="started"
        icon={<CalendarIcon size={14} weight="bold" />}
        label="Started"
        value={formatStartedDate(book.started)}
      />,
    );
  }

  if (facts.length === 0) return null;
  return (
    <dl data-book-facts className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
      {facts}
    </dl>
  );
}

function CopyLinkButton({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "gap-1.5 px-2 transition-colors duration-200 sm:gap-2 sm:px-3",
        copied
          ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
          : "text-muted-foreground/70 hover:text-foreground",
      )}
      aria-label={copied ? "Link copied" : "Copy link"}
      onClick={onClick}
    >
      <span aria-hidden="true" className="relative size-3.5 shrink-0">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={copied ? "check" : "link"}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.55, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.7, rotate: 10 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {copied ? (
              <CheckIcon size={14} weight="bold" />
            ) : (
              <LinkIcon size={14} weight="bold" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span
        aria-live="polite"
        className="inline-block text-left sm:min-w-[4.25rem]"
      >
        {copied ? "Copied" : "Copy link"}
      </span>
    </Button>
  );
}

type BookDetailBook = BaseBook &
  Partial<
    Pick<Book, "readNumber" | "totalReads" | "otherReadings" | "coverColor">
  > & {
    notes?: string;
  };

type BookDetailContentProps = {
  book: BookDetailBook;
  fullBook?: BookDetailBook;
  isLoadingNotes: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  onShare: () => void;
  copied: boolean;
  bookId: string;
  bookshelfBookCount?: number;
  isModal?: boolean;
  onClose?: () => void;
  /** Shown only when a modal was opened outside the dedicated Books site. */
  modalBreadcrumbHref?: string;
  /** Absolute detail URL when the modal lives outside the Books host. */
  modalBookHref?: string;
  /** Books-host count mirrored into the external modal breadcrumb. */
  modalBookCount?: number;
  /** Animated takeover for the expand control; the <a> stays the fallback. */
  onExpand?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** The modal has grown into the page — the expand control retires. */
  expanded?: boolean;
  /** Where a tag leads: the shelf, narrowed to that one tag. Absent, the
   * tags stay plain labels. */
  tagHref?: (tag: string) => string;
  /** In-place takeover for a tag press; the link stays the fallback. */
  onTagSelect?: (tag: string, event: MouseEvent<HTMLAnchorElement>) => void;
};

export function BookDetailContent({
  book,
  fullBook,
  isLoadingNotes,
  contentRef,
  onShare,
  copied,
  bookId,
  bookshelfBookCount,
  isModal = false,
  onClose,
  modalBreadcrumbHref,
  modalBookHref,
  modalBookCount,
  onExpand,
  expanded = false,
  tagHref,
  onTagSelect,
}: BookDetailContentProps) {
  const coverUrl = enhanceCoverUrl(book.coverUrl);
  const notice = selectBookNotice(book);

  // The analytics interface deduplicates Strict Mode remounts and modal/page
  // coexistence for this book during the current document lifecycle.
  useEffect(() => {
    captureOnce(`book-viewed:${book.id}`, "book_viewed", {
      book_id: book.id,
      book_title: book.title,
      author: book.author,
      rating: book.rating,
      tags: book.tags,
    });
  }, [book.id, book.title, book.author, book.rating, book.tags]);

  const handleNotionClick = () => {
    capture("book_notion_opened", {
      book_id: book.id,
      book_title: book.title,
    });
  };

  const handleAudibleClick = () => {
    capture("book_audible_opened", {
      book_id: book.id,
      book_title: book.title,
    });
  };

  const handleTagClick = (
    tag: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    capture("book_tag_opened", {
      book_id: book.id,
      book_title: book.title,
      tag,
    });
    onTagSelect?.(tag, event);
  };

  const renderTag = (tag: string) => (
    <TagBadge
      key={tag}
      tag={tag}
      href={tagHref?.(tag)}
      onClick={tagHref ? (event) => handleTagClick(tag, event) : undefined}
    />
  );

  const handleShare = () => {
    capture("book_link_copied", {
      book_id: book.id,
      book_title: book.title,
    });
    onShare();
  };

  // Scroll-driven animation setup
  // The raw scroll depth is the target; the header follows it through one of
  // the two springs above, chosen by which way the target just moved.
  const smoothProgress = useMotionValue(0);
  const progressTarget = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // Responsive breakpoint detection
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  const showBreadcrumb = !isModal || Boolean(modalBreadcrumbHref);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    setIsLargeScreen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const geometry = headerGeometry(isLargeScreen, isModal, showBreadcrumb);

  // The sizes that make up the header's silhouette are left unclamped so the
  // spring's overshoot shows: the header breathes a little past either size
  // before it settles. Everything else clamps at its ends.
  const overshoot = { clamp: false };
  const coverHeight = useTransform(
    smoothProgress,
    [0, 1],
    px(geometry.cover),
    overshoot,
  );
  const coverBorderRadius = useTransform(
    smoothProgress,
    [0, 1],
    ["12px", "4px"],
  );
  // How far the header's silhouette currently extends past its box.
  const headerOverflow = useTransform(smoothProgress, (progress) =>
    Math.max(0, geometry.shrink * (1 - progress)),
  );
  const coverBoxShadow = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen
      ? ["0px 8px 20px rgba(0, 0, 0, 0.15)", "0px 2px 6px rgba(0, 0, 0, 0.1)"]
      : ["0px 4px 6px rgba(0, 0, 0, 0.1)", "0px 1px 3px rgba(0, 0, 0, 0.08)"],
  );

  // Header padding
  const headerPadding = useTransform(
    smoothProgress,
    [0, 1],
    px(geometry.paddingTop),
    overshoot,
  );
  const headerBottomPadding = useTransform(
    smoothProgress,
    [0, 1],
    px(geometry.paddingBottom),
    overshoot,
  );
  // The crumb is a caption over the title now, not a row of its own across the
  // top of the card, so it sits much closer than the 20px it used to.
  const columnBreadcrumbMarginBottom = useTransform(
    smoothProgress,
    [0, 1],
    ["4px", "2px"],
  );

  // Text sizing
  const titleFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["36px", "28px"] : ["24px", "18px"],
    overshoot,
  );
  const authorFontSize = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["20px", "16px"] : ["16px", "14px"],
    overshoot,
  );
  const headerGap = useTransform(
    smoothProgress,
    [0, 1],
    isLargeScreen ? ["28px", "12px"] : ["16px", "12px"],
    overshoot,
  );
  const titleAuthorGap = useTransform(smoothProgress, [0, 1], ["2px", "0px"]);
  const titleLineClamp = useTransform(smoothProgress, [0.4, 0.7], [2, 1]);

  // The narrow layout's metadata sits below the cover, in flow, and scrolls
  // at finger speed like everything else; it used to fade on the fold's
  // clock, which finishes 186px in while the block is still ~250px tall and
  // fully on screen, so the fold ended on a blank column of invisible rows.
  // Each segment now dissolves by how much of its own box has slid under the
  // header's bottom edge (0 while clear, 1 once wholly under), so nothing
  // disappears from a place the reader can still see.
  const mobileIdentityUnder = useMotionValue(0);
  const mobileFactsUnder = useMotionValue(0);
  const mobileRatingUnder = useMotionValue(0);
  const mobileTagsUnder = useMotionValue(0);
  const mobileActionsUnder = useMotionValue(0);
  const mobileSegments = useRef<Record<MobileSegment, HTMLDivElement | null>>({
    identity: null,
    facts: null,
    rating: null,
    tags: null,
    actions: null,
  });
  // Motion values are stable per mount, so one map of them is too; the
  // scroll effect reads it without listing five values as dependencies.
  const mobileSegmentUnder = useRef<Record<MobileSegment, MotionValue<number>>>(
    {
      identity: mobileIdentityUnder,
      facts: mobileFactsUnder,
      rating: mobileRatingUnder,
      tags: mobileTagsUnder,
      actions: mobileActionsUnder,
    },
  ).current;
  const bindMobileSegment =
    (segment: MobileSegment) => (node: HTMLDivElement | null) => {
      mobileSegments.current[segment] = node;
    };

  // The identity leaves faster than the rows below it, so that it is gone
  // before its replacement in the bar arrives (see compactHeaderOpacity).
  // What is still below the edge at 0.6, at most the author line, sits
  // inside the glass overhang, which is already dissolving it.
  const mobileIdentityOpacity = useTransform(
    mobileIdentityUnder,
    [0, 0.6],
    [1, 0],
  );
  const mobileFactsOpacity = useTransform(mobileFactsUnder, [0, 1], [1, 0]);
  const mobileRatingOpacity = useTransform(mobileRatingUnder, [0, 1], [1, 0]);
  const mobileTagsOpacity = useTransform(mobileTagsUnder, [0, 1], [1, 0]);
  const mobileActionsOpacity = useTransform(mobileActionsUnder, [0, 1], [1, 0]);

  // The compact title beside the folded cover takes over from the resting
  // one as that slides under the header. Sequential, not a crossfade: the
  // resting title is down to a sixth when this starts and gone a third of
  // the way through, so the page never reads the title twice. The resting
  // title reaches the edge right as the fold completes (it starts 4px below
  // the spacer), so the bar holds a bare cover for ~40px of scroll at most.
  const compactHeaderOpacity = useTransform(
    mobileIdentityUnder,
    [0.5, 0.8],
    isLargeScreen ? [0, 0] : [0, 1],
  );

  // Collapse from the bottom upward so the remaining content never appears
  // to jump over something that has already vanished: actions, tags, rating,
  // then facts. The rating used to sit above the facts, so those final two
  // stages must follow their new visual order.
  const factsOpacity = useTransform(
    smoothProgress,
    [0.34, 0.54],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const ratingOpacity = useTransform(
    smoothProgress,
    [0.22, 0.4],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const tagsOpacity = useTransform(
    smoothProgress,
    [0.1, 0.26],
    isLargeScreen ? [1, 0] : [1, 1],
  );
  const actionsOpacity = useTransform(
    smoothProgress,
    [0, 0.12],
    isLargeScreen ? [1, 0] : [1, 1],
  );

  const factsVisibility = useHiddenWhenClear(factsOpacity);
  const ratingVisibility = useHiddenWhenClear(ratingOpacity);
  const tagsVisibility = useHiddenWhenClear(tagsOpacity);
  const actionsVisibility = useHiddenWhenClear(actionsOpacity);
  const compactHeaderVisibility = useHiddenWhenClear(compactHeaderOpacity);
  const mobileActionsVisibility = useHiddenWhenClear(mobileActionsOpacity);
  const mobileTagsVisibility = useHiddenWhenClear(mobileTagsOpacity);
  const mobileRatingVisibility = useHiddenWhenClear(mobileRatingOpacity);
  const mobileFactsVisibility = useHiddenWhenClear(mobileFactsOpacity);
  const mobileIdentityVisibility = useHiddenWhenClear(mobileIdentityOpacity);

  // Track scroll for sticky headers
  useEffect(() => {
    const contentEl = isModal ? contentRef?.current : null;
    if (isModal && !contentEl) return;
    const scroller: EventTarget = contentEl ?? window;
    // The fold runs over exactly the height the header gives up, so the
    // notes' top edge and the header's bottom edge travel together.
    const readProgress = () => {
      const scrollTop = contentEl ? contentEl.scrollTop : window.scrollY;
      return Math.min(Math.max(scrollTop / geometry.shrink, 0), 1);
    };

    // The narrow layout's segments read their own position against the
    // header's box, which is the folded height at all times, so the edge is
    // stable even while the spring is still shaping the silhouette. Set
    // directly rather than sprung: a dissolve keyed to where a row IS must
    // track the row, not lag it.
    const placeSegments = () => {
      const header = headerRef.current;
      if (!header) return;
      const edge = header.getBoundingClientRect().bottom;
      for (const segment of MOBILE_SEGMENTS) {
        const node = mobileSegments.current[segment];
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        mobileSegmentUnder[segment].set(underHeader(edge, rect));
      }
    };

    const follow = () => {
      placeSegments();
      const next = readProgress();
      if (next === progressTarget.current) return;
      progressTarget.current = next;
      // Each call restarts from the current value and velocity, so a
      // reversal mid-fold hands off without a jump.
      animate(smoothProgress, next, HEADER_SPRING);
    };
    // A restored scroll position lands folded without playing the fold.
    progressTarget.current = readProgress();
    smoothProgress.jump(progressTarget.current);
    placeSegments();
    // Fonts settling or the title rewrapping move the rows without a scroll.
    // The rows are watched as well as the scroller: a rewrap changes a row's
    // own box, never the modal scroller's.
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(placeSegments);
    resize?.observe(contentEl ?? document.documentElement);
    for (const segment of MOBILE_SEGMENTS) {
      const node = mobileSegments.current[segment];
      if (node) resize?.observe(node);
    }
    scroller.addEventListener("scroll", follow, { passive: true });
    return () => {
      resize?.disconnect();
      scroller.removeEventListener("scroll", follow);
      smoothProgress.stop();
    };
  }, [
    contentRef,
    geometry.shrink,
    isModal,
    mobileSegmentUnder,
    smoothProgress,
  ]);

  return (
    <div
      ref={contentRef}
      className={cn(
        "relative",
        isModal
          ? "h-full overflow-y-auto overflow-x-hidden"
          : "min-h-[100dvh] overflow-x-clip",
        // The header is in flow above the notes, so every pixel it gives up
        // moves them, and scroll anchoring answers by scrolling the container
        // back to hold them still. With the spring still settling, that fight
        // walked a 50px scroll back to 12px and jittered the header: the
        // mid-collapse rubber band. Anchoring is off for this scroller.
        "[overflow-anchor:none]",
      )}
    >
      {/* Unified Sticky Header. Its box is always the folded height; the
          resting silhouette overflows it, onto the spacer below. */}
      <motion.div
        ref={headerRef}
        className="sticky top-0 z-20"
        style={{
          paddingTop: headerPadding,
          paddingBottom: headerBottomPadding,
          height: geometry.collapsed,
        }}
      >
        <HeaderGlassBackdrop
          progress={smoothProgress}
          isModal={isModal}
          hasBreadcrumb={isLargeScreen && showBreadcrumb}
        />
        {/* Backing for the part of the header that overflows its box while
            the spring lags the scroll: during a fast fling the resting cover
            and title column would otherwise draw over the notes' first
            lines. Sized to the overflow alone, so the folded header's glass
            still samples the notes beneath it. Wide layout only: there the
            title column's facts and tags float in the overflow with nothing
            behind them. On the narrow layout the overflow is just the cover,
            which is opaque, and what sits under it is the in-flow title, so
            a full-width backing there painted a hard band across the top of
            that title on every fling. */}
        {isLargeScreen && (
          <motion.div
            aria-hidden
            data-book-header-backing
            className={cn(
              "pointer-events-none absolute inset-x-0 bg-background",
              isModal && "dark:bg-muted",
            )}
            style={{ top: geometry.collapsed, height: headerOverflow }}
          />
        )}
        {/* Keep the side inset close to the header's vertical inset. */}
        <div className="relative mx-auto w-full max-w-4xl">
          {/* Modal-only action buttons — the same cluster, in the same
              material, as every other presented document (SheetControls). */}
          {isModal && (
            <SheetControlCluster className="absolute right-6 top-0.5 z-10 xs:right-14 sm:top-2 lg:top-[10px]">
              {!expanded && (
                <SheetExpandControl
                  href={modalBookHref ?? getBookPath(bookId)}
                  onClick={onExpand}
                />
              )}
              {onClose && <SheetCloseControl onClick={onClose} />}
            </SheetControlCluster>
          )}

          {/* Main Row: Cover + Title/Author (Compact) */}
          <motion.div
            className="flex w-full flex-row items-start px-6 xs:px-14"
            style={{ gap: headerGap }}
          >
            {/* Cover Image */}
            <motion.div
              className="aspect-[2/3] flex-shrink-0"
              style={{ height: coverHeight }}
            >
              {coverUrl ? (
                <motion.div
                  style={{
                    borderRadius: coverBorderRadius,
                    boxShadow: coverBoxShadow,
                    // Sampled jacket color behind the image while it loads
                    backgroundColor: book.coverColor ?? undefined,
                  }}
                  className="h-full w-full overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverUrl}
                    alt={`${book.title} cover`}
                    className="h-full w-full object-cover"
                  />
                </motion.div>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted p-2 text-center shadow-md">
                  <p className="text-xs font-semibold text-foreground">
                    {book.title}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Compact Title/Author - Desktop shows animated version, Mobile fades in */}
            {isLargeScreen ? (
              /* Desktop: Animated title/author with metadata */
              <motion.div
                // Keyed apart from the compact column so the breakpoint flip
                // after hydration mounts a fresh node. Both are motion.divs in
                // the same slot, and a reused node keeps the styles Framer
                // wrote to it imperatively (the compact column's visibility
                // and opacity), which would leave this column invisible.
                key="wide"
                className="relative min-w-0 flex-1 overflow-visible pr-12"
              >
                <div className="relative">
                  {showBreadcrumb && (
                    <BookBreadcrumb
                      modalBreadcrumbHref={modalBreadcrumbHref}
                      modalBookCount={modalBookCount}
                      bookshelfBookCount={bookshelfBookCount}
                      marginBottom={columnBreadcrumbMarginBottom}
                    />
                  )}
                  <motion.h2
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: titleFontSize,
                      marginBottom: titleAuthorGap,
                      display: "-webkit-box",
                      WebkitLineClamp: titleLineClamp,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    className={cn(
                      "font-semibold leading-[1.125] text-foreground",
                      isModal && "mr-12",
                    )}
                  >
                    {book.title}
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: authorFontSize,
                    }}
                    className="line-clamp-1 text-muted-foreground"
                  >
                    {book.author}
                  </motion.p>

                  {/* Metadata - Desktop only.
                      Width was a hand-solved `calc(min(100vw, 768px) - ...)`
                      pinned to a 3xl card. The card is max-w-4xl now, so that
                      literal was holding the tag row ~130px narrower than the
                      column it lives in and wrapping four tags onto two lines
                      for no reason. It tracks the column now, so the metadata
                  and the title share one right edge at every width. */}
                  <motion.div className="absolute left-0 top-full w-full pt-2">
                    <motion.div
                      className="mt-2"
                      style={{
                        opacity: factsOpacity,
                        visibility: factsVisibility,
                      }}
                    >
                      <BookFacts book={book} />
                    </motion.div>

                    {book.rating && (
                      <motion.div
                        role="img"
                        aria-label={`${book.rating} out of 5 stars`}
                        className="mt-3 flex gap-1"
                        style={{
                          opacity: ratingOpacity,
                          visibility: ratingVisibility,
                        }}
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <StarIcon
                            key={i}
                            size={20}
                            weight={i < book.rating! ? "fill" : "duotone"}
                            className={
                              i < book.rating!
                                ? "text-yellow-400"
                                : "text-muted-foreground/25"
                            }
                          />
                        ))}
                      </motion.div>
                    )}

                    {book.tags.length > 0 && (
                      <motion.div
                        className="mt-4 flex flex-wrap gap-2"
                        style={{
                          opacity: tagsOpacity,
                          visibility: tagsVisibility,
                        }}
                      >
                        {book.tags.map(renderTag)}
                      </motion.div>
                    )}

                    <motion.div
                      className="mt-3"
                      style={{
                        opacity: actionsOpacity,
                        visibility: actionsVisibility,
                      }}
                    >
                      <div
                        role="group"
                        aria-label="Book actions"
                        className="-ml-3 flex flex-wrap items-center gap-0"
                      >
                        <CopyLinkButton copied={copied} onClick={handleShare} />

                        {book.audibleUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground/70 hover:text-foreground"
                            asChild
                          >
                            <a
                              href={book.audibleUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleAudibleClick}
                            >
                              <HeadphonesIcon size={14} weight="bold" />
                              <span>Listen on Audible</span>
                            </a>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground/70 hover:text-foreground"
                          asChild
                        >
                          <a
                            href={book.notionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleNotionClick}
                          >
                            <ArrowSquareOutIcon size={14} weight="bold" />
                            <span>View in Notion</span>
                          </a>
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              /* Mobile: Simple compact title/author that fades in */
              <motion.div
                key="compact"
                className="flex min-w-0 flex-1 flex-col gap-0 pr-24"
                style={{
                  opacity: compactHeaderOpacity,
                  visibility: compactHeaderVisibility,
                }}
              >
                <motion.h2
                  style={{ fontSize: titleFontSize }}
                  className="line-clamp-1 font-semibold leading-tight text-foreground"
                >
                  {book.title}
                </motion.h2>
                <motion.p
                  style={{ fontSize: authorFontSize }}
                  className="line-clamp-1 text-muted-foreground"
                >
                  {book.author}
                </motion.p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
      {/* The room the resting header overflows into. The notes start below it
          and scroll 1:1; the header only ever changes its own shape. */}
      <div
        aria-hidden
        data-book-header-spacer
        style={{ height: geometry.shrink }}
      />

      {/* Full Metadata Section - Mobile Only (fades out as user scrolls) */}
      {!isLargeScreen && (
        <div className="mx-auto w-full max-w-4xl px-6 pb-4 pt-1 xs:px-14">
          <div className="flex flex-col gap-3 sm:gap-4">
            <motion.div
              ref={bindMobileSegment("identity")}
              data-mobile-book-segment="identity"
              style={{
                opacity: mobileIdentityOpacity,
                visibility: mobileIdentityVisibility,
              }}
              className="flex flex-col gap-0.5"
            >
              {/* The crumb sits over the title here too. On this layout the
                  title lives below the header rather than in it, so the crumb
                  comes down with it and rides the same resting-metadata fade
                  as the rating, dates and tags; the compact sticky header
                  takes over from there. */}
              {showBreadcrumb && (
                <BookBreadcrumb
                  modalBreadcrumbHref={modalBreadcrumbHref}
                  modalBookCount={modalBookCount}
                  bookshelfBookCount={bookshelfBookCount}
                  marginBottom={columnBreadcrumbMarginBottom}
                />
              )}
              {/* Title */}
              <h2 className="text-2xl font-semibold leading-tight text-foreground">
                {book.title}
              </h2>

              {/* Author */}
              <p className="text-base text-muted-foreground">{book.author}</p>
            </motion.div>
            <motion.div
              ref={bindMobileSegment("facts")}
              data-mobile-book-segment="facts"
              style={{
                opacity: mobileFactsOpacity,
                visibility: mobileFactsVisibility,
              }}
              className="-mt-2"
            >
              <BookFacts book={book} />
            </motion.div>

            {/* Rating follows the reading facts as their visual conclusion. */}
            {book.rating && (
              <motion.div
                ref={bindMobileSegment("rating")}
                data-mobile-book-segment="rating"
                style={{
                  opacity: mobileRatingOpacity,
                  visibility: mobileRatingVisibility,
                }}
                role="img"
                aria-label={`${book.rating} out of 5 stars`}
                className="flex gap-1"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon
                    key={i}
                    size={20}
                    weight={i < book.rating! ? "fill" : "duotone"}
                    className={
                      i < book.rating!
                        ? "text-yellow-400"
                        : "text-muted-foreground/25"
                    }
                  />
                ))}
              </motion.div>
            )}

            {/* Tags */}
            {book.tags.length > 0 && (
              <motion.div
                ref={bindMobileSegment("tags")}
                data-mobile-book-segment="tags"
                style={{
                  opacity: mobileTagsOpacity,
                  visibility: mobileTagsVisibility,
                }}
                className="flex flex-wrap gap-1.5 sm:gap-2"
              >
                {book.tags.map(renderTag)}
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              ref={bindMobileSegment("actions")}
              data-mobile-book-segment="actions"
              style={{
                opacity: mobileActionsOpacity,
                visibility: mobileActionsVisibility,
              }}
            >
              <div
                role="group"
                aria-label="Book actions"
                className="-ml-2 flex flex-nowrap items-center gap-0"
              >
                <CopyLinkButton copied={copied} onClick={handleShare} />

                {book.audibleUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2 text-muted-foreground/70 hover:text-foreground sm:gap-2 sm:px-3"
                    asChild
                  >
                    <a
                      href={book.audibleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleAudibleClick}
                    >
                      <HeadphonesIcon size={14} weight="bold" />
                      <span className="sm:hidden">Audible</span>
                      <span className="hidden sm:inline">
                        Listen on Audible
                      </span>
                    </a>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2 text-muted-foreground/70 hover:text-foreground sm:gap-2 sm:px-3"
                  asChild
                >
                  <a
                    href={book.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleNotionClick}
                  >
                    <ArrowSquareOutIcon size={14} weight="bold" />
                    <span>View in Notion</span>
                  </a>
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className={cn(
          "mx-auto w-full max-w-4xl px-6 pt-0 xs:px-14 md:pt-6",
          !book.hasNotes && "lg:pb-0",
        )}
      >
        {/*
         * Sits outside the notes branch: an unfinished book is worth flagging
         * whether or not any notes have made it onto the page yet, and it does
         * not have to wait on the notes fetch.
         */}
        {notice === "reading" && book.hasNotes && <ReadingNowNotice />}
        {notice === "abandoned" && book.hasNotes && (
          <AbandonedNotice percent={abandonedPercent(book)} />
        )}

        {/* Notes section */}
        {book.hasNotes ? (
          <div className="pb-[min(25vh,300px)]">
            {isLoadingNotes ? (
              <BookNotesLoadingSkeleton />
            ) : fullBook?.notes ? (
              <>
                {notice === "automated" && <AutomatedNotice />}
                <div
                  className={cn(
                    "prose prose-base prose-neutral max-w-none leading-[1.85] text-foreground",
                    "prose-headings:mb-0 prose-headings:font-semibold prose-headings:text-foreground prose-h1:translate-y-3 prose-h1:py-3 prose-h1:text-2xl prose-h2:translate-y-[-8px] prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-xs",
                    "prose-p:translate-y-2 prose-p:text-foreground prose-a:text-foreground prose-a:underline prose-a:decoration-foreground/15 hover:prose-a:text-foreground hover:prose-a:decoration-foreground/30 prose-strong:font-semibold prose-strong:text-foreground",
                    "prose-ol:my-0 prose-ol:list-decimal prose-ul:my-0 prose-ul:list-disc prose-li:my-px prose-li:text-foreground",
                    "prose-img:max-h-[600px] prose-img:max-w-[400px] prose-img:rounded-lg prose-img:shadow-md",
                  )}
                >
                  <PhotoProvider>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      urlTransform={(url) => {
                        // Allow data URLs (base64 images from Notion)
                        if (url.startsWith("data:")) {
                          return url;
                        }
                        // Allow Notion S3 image URLs
                        if (url.includes("prod-files-secure.s3")) {
                          return url;
                        }
                        // Use default transform for security on other URLs
                        return defaultUrlTransform(url);
                      }}
                      components={
                        {
                          img: ({ src, alt, ...props }) => {
                            if (!src) return null;
                            return (
                              <PhotoView src={src as string}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={alt ?? ""}
                                  className="cursor-zoom-in"
                                  {...props}
                                />
                              </PhotoView>
                            );
                          },
                          details: ({ node: _node, ...props }) => (
                            <AnimatedDetails {...props} />
                          ),
                          blockquote: ({
                            children,
                            node: _node,
                            className,
                            ...props
                          }) => (
                            <blockquote
                              {...props}
                              className={cn(
                                "book-notes-quote my-4 border-l-2 border-foreground/15 py-1 pl-5 font-normal italic text-muted-foreground",
                                className,
                              )}
                            >
                              {children}
                            </blockquote>
                          ),
                          summary: BookNoteSummary,
                        } as Components
                      }
                    >
                      {processDetailsBlocks(
                        separateCachedQuoteBlocks(fullBook.notes),
                      )}
                    </ReactMarkdown>
                  </PhotoProvider>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                This book has notes. View them in{" "}
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
            )}
          </div>
        ) : (
          <NoNotesState
            status={
              notice === "reading" || notice === "abandoned" ? notice : "read"
            }
          />
        )}
      </div>
    </div>
  );
}
