// Homepage 3D scene — unit registry, serializable home-page data contract, and small
// formatters. Client-safe: no JSON imports, no server-only modules.
import {
  BarbellIcon,
  BooksIcon,
  CodeIcon,
  CompassIcon,
  type Icon,
  MicrophoneStageIcon,
  PenNibIcon,
  UserIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ReadingBookEdgeColor } from "~/lib/books/coverEdgeColor";
import type {
  Book,
  HomepageBookCover,
  HomepageBookPlacard,
  HomepageBookStats,
} from "~/lib/books/types";

export type UnitSlug =
  | "about"
  | "books"
  | "training"
  | "talks"
  | "projects"
  | "blog"
  | "systems";

export type Unit = {
  /** Stable internal key used by Scene's component map and flat-page slots. */
  slug: UnitSlug;
  /** Public URL hash when the internal key is implementation-oriented. Old
   * internal-key hashes remain accepted as aliases. */
  urlSlug?: string;
  urlAliases?: string[];
  /** The section's canonical name, used by its panel, sheet, and announcements.
   * These names come from the sections' own markup rather
   * than off either old field — BookNotes/Talks/Projects/BlogPosts h1s, and
   * Weightlifting.tsx, which is the whole of the training placard, and
   * PersonalSystems.tsx, which names the shared manual/routine section.
   * About is the sole container with no heading of its own. */
  label: string;
  /** Optional shorter navigation copy. This may abbreviate a title but must
   * not replace `label` anywhere outside the unit rail. */
  railLabel?: string;
  /** The section's own glyph, so the rail entry and the heading it leads to
   * are the same mark. Taken from each section's h1 — BooksIcon, BarbellIcon,
   * MicrophoneStageIcon, CodeIcon, PenNibIcon, CompassIcon. About gets the
   * person glyph because its placard intentionally has no heading. */
  icon: Icon;
};

export const UNITS: Unit[] = [
  { slug: "about", label: "About", icon: UserIcon },
  { slug: "books", label: "Book Notes", icon: BooksIcon },
  {
    slug: "training",
    urlSlug: "weightlifting",
    label: "Weightlifting",
    icon: BarbellIcon,
  },
  { slug: "systems", label: "Systems", icon: CompassIcon },
  { slug: "projects", label: "Projects", icon: CodeIcon },
  {
    slug: "blog",
    urlSlug: "musings",
    label: "Musings",
    icon: PenNibIcon,
  },
  {
    slug: "talks",
    label: "Featured Talks",
    railLabel: "Talks",
    icon: MicrophoneStageIcon,
  },
];

export const UNIT_COUNT = UNITS.length;
export const GOLF_PATHNAME = "/golf";
export const GOLF_UNIT_INDEX = UNITS.findIndex(
  (unit) => unit.slug === "training",
);
/** A narrow, rail-less camera stop between Books and Weightlifting. It sits
 * slightly toward Books so the foreground club and balls land around the
 * centre instead of bunching against the left edge. */
export const GOLF_STOP_POSITION = 1.52;
/** Golf enters after Books has clearly released and remains available until
 * just before Weightlifting reaches its authored centre. */
export const GOLF_FOCUS_START = 1.36;
export const GOLF_FOCUS_END = 1.78;

export function unitIndexFromHash(hash: string): number | null {
  const slug = hash.replace(/^#/, "");
  const index = UNITS.findIndex(
    (unit) =>
      unit.slug === slug ||
      unit.urlSlug === slug ||
      unit.urlAliases?.includes(slug),
  );
  return index === -1 ? null : index;
}

export function scenePositionFromHash(hash: string): number | null {
  if (hash.replace(/^#/, "") === "golf") return GOLF_STOP_POSITION;
  return unitIndexFromHash(hash);
}

function normalizedPathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function defaultScenePositionForPathname(pathname: string) {
  return normalizedPathname(pathname) === GOLF_PATHNAME
    ? GOLF_STOP_POSITION
    : 0;
}

/** Explicit section hashes win; otherwise a hidden route may choose a
 * different initial room stop than the canonical homepage. */
export function initialScenePositionFromLocation(
  pathname: string,
  hash: string,
) {
  return (
    scenePositionFromHash(hash) ?? defaultScenePositionForPathname(pathname)
  );
}

export function golfFocusedForScenePosition(position: number) {
  return position >= GOLF_FOCUS_START && position <= GOLF_FOCUS_END;
}

/** Mirrors travel without erasing a pathname's special default. On /golf,
 * the hidden Golf stop is the clean URL, so every public unit keeps a hash. */
export function unitUrlForLocation(
  pathname: string,
  search: string,
  unitIndex: number,
) {
  const base = `${pathname}${search}`;
  const unit = UNITS[unitIndex];
  const slug = unit?.urlSlug ?? unit?.slug;
  const pathnameDefault = defaultScenePositionForPathname(pathname);
  if (
    !slug ||
    (Number.isInteger(pathnameDefault) && unitIndex === pathnameDefault)
  )
    return base;
  return `${base}#${slug}`;
}

export function sceneUrlForLocation(
  pathname: string,
  search: string,
  unitIndex: number,
  golfFocused: boolean,
) {
  const base = `${pathname}${search}`;
  if (golfFocused)
    return normalizedPathname(pathname) === GOLF_PATHNAME
      ? base
      : `${base}#golf`;
  return unitUrlForLocation(pathname, search, unitIndex);
}

export type StacksTalk = {
  videoId: string;
  title: string;
  venue: string;
  url: string;
  still: string;
};

export type StacksProject = {
  name: string;
  link?: string;
  image: string;
};

export type StacksBlogPost = {
  title: string;
  link: string;
  pubDate: string;
};

/** One packed-row spine's worth of a real library book. Deliberately slim:
 * the spine needs a width (from length metadata), a Door Label (title/author)
 * and a click id — never the cover image, so carrying full Book objects here
 * would put the whole library's serialization on the homepage payload for
 * fields no spine reads. Clicks resolve through the books-app modal by id. */
export type StacksSpineBook = {
  id: string;
  title: string;
  author: string;
  pageCount: number | null;
  audioLengthMin: number | null;
};

export type StacksData = {
  covers: HomepageBookCover[];
  /** Full Book objects for the covers rendered in-scene — instant modal open. */
  shelfBooks: Book[];
  /** The packed rows behind the featured rank, oldest last: real finished
   * reads (newest first, featured excluded — those already stand cover-out).
   * The scene consumes as many as its two rows physically hold. */
  spineBooks: StacksSpineBook[];
  /** The books Chappy ticked "Featured?" on in Notion, newest finish first.
   *
   * Owner-curated, so the length is whatever he has checked — eight today. Do
   * NOT assume eight upstream: consumers must handle this list growing. The
   * physical scene shows the newest books up to its measured two-row capacity
   * while the DOM library retains the full list. Every entry is also present
   * in `shelfBooks`, which is what
   * `StacksCanvas.onOpenBook` searches by id and what `Scene` warms through
   * the image proxy — so a featured cover is always clickable and pre-decoded.
   *
   * "Featured?" is set per Notion page, not per title: 7 Habits has two reads
   * and only the 2023 one is featured. Match on `book.id` (the slug), never on
   * title. */
  featuredBooks: Book[];
  /** Server-sampled physical-board colors for every featured book. */
  featuredBookColors: Record<string, ReadingBookEdgeColor>;
  /** Up to three newest current/recent reads with covers for the About shelf. */
  readingBooks: Book[];
  /** Server-sampled jacket perimeter colors for the About books.
   * This stays scene-only: it does not extend the Notion/DB book schema. */
  readingBookColors: Record<string, ReadingBookEdgeColor>;
  bookStats: HomepageBookStats;
  /** Compact, derived data for the richer Book Notes placard. Full book notes
   * and unused library fields stay server-side. */
  bookPlacard: HomepageBookPlacard;
  talks: StacksTalk[];
  projects: StacksProject[];
  blogPosts: StacksBlogPost[];
};

/** Server-rendered section subtrees, composed by both flat and world modes. */
export type StacksSlots = {
  about: ReactNode;
  aboutIntro: ReactNode;
  contact: ReactNode;
  books: ReactNode;
  training: ReactNode;
  systems: ReactNode;
  talks: ReactNode;
  blog: ReactNode;
  projects: ReactNode;
  quotes: ReactNode;
};
