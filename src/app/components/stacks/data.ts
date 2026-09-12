// Homepage 3D scene — unit registry, serializable home-page data contract, and small
// formatters. Client-safe: no JSON imports, no server-only modules.
import {
  BarbellIcon,
  BooksIcon,
  CodeIcon,
  GearIcon,
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
import {
  GOLF_PATHNAME,
  ROOM_HOME_PATHNAME,
  ROOM_SECTION_PATHNAMES,
  normalizeRoomPathname,
  roomSectionSlugForPathname,
} from "~/lib/site/roomRoutes";

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
   * MicrophoneStageIcon, CodeIcon, PenNibIcon, GearIcon. About gets the
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
  {
    slug: "systems",
    label: "Personal Systems",
    railLabel: "Systems",
    icon: GearIcon,
  },
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
export { GOLF_PATHNAME } from "~/lib/site/roomRoutes";
export const GOLF_UNIT_INDEX = UNITS.findIndex(
  (unit) => unit.slug === "training",
);
/** A narrow, rail-less camera stop between Books and Weightlifting. It sits
 * slightly toward Books so the foreground club and balls land around the
 * centre instead of bunching against the left edge. */
export const GOLF_STOP_POSITION = 1.52;
/** The Golf stop's window along the aisle. It keys the camera-depth
 * keyframes and the URL's #golf. It no longer decides golf mode itself,
 * nor the golf dolly: the mode is how much of the green the visitor can
 * see between the Books and Weightlifting stops (scene/golfVisibility.ts,
 * scene/golfMode.ts), which the pointer can move, and the dolly rides the
 * mode's weight with the focus and the pivot.
 * The window used to run 0.26 past the stop toward Weightlifting against
 * 0.16 toward Books; once the focus rack and the cup pivot made its edges
 * visible, that read as golf reaching into the Weightlifting section, and
 * 0.16 still held on a beat too long. */
export const GOLF_FOCUS_START = 1.36;
export const GOLF_FOCUS_END = 1.62;

/** The shelf whose stop is the homepage. Its URL is `/`, never `/#about`. */
const HOME_UNIT_INDEX = UNITS.findIndex((unit) => unit.slug === "about");

function unitIndexForSlug(slug: string): number | null {
  const index = UNITS.findIndex(
    (unit) =>
      unit.slug === slug ||
      unit.urlSlug === slug ||
      unit.urlAliases?.includes(slug),
  );
  return index === -1 ? null : index;
}

export function unitIndexFromHash(hash: string): number | null {
  return unitIndexForSlug(hash.replace(/^#/, ""));
}

export function scenePositionFromHash(hash: string): number | null {
  if (hash.replace(/^#/, "") === "golf") return GOLF_STOP_POSITION;
  return unitIndexFromHash(hash);
}

/** The stop a pathname opens on when the URL carries no hash: the golf
 * green on /golf, a shelf on its own path, About everywhere else. */
export function defaultScenePositionForPathname(pathname: string) {
  if (normalizeRoomPathname(pathname) === GOLF_PATHNAME)
    return GOLF_STOP_POSITION;
  const slug = roomSectionSlugForPathname(pathname);
  return (slug === null ? null : unitIndexForSlug(slug)) ?? HOME_UNIT_INDEX;
}

/** Explicit section hashes win; otherwise the pathname chooses the stop. */
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

function unitPublicSlug(unitIndex: number) {
  const unit = UNITS[unitIndex];
  return unit ? (unit.urlSlug ?? unit.slug) : null;
}

/** One URL per stop. A shelf that owns a path IS that path; About's stop is
 * the homepage; every other shelf is the homepage plus its hash. Search
 * params ride along so an owner mode (`?debug=1`) survives travel. Hash
 * aliases and `/about` still resolve on load, but nothing writes them. */
export function unitUrl(unitIndex: number, search = "") {
  const slug = unitPublicSlug(unitIndex);
  if (slug === null || unitIndex === HOME_UNIT_INDEX)
    return `${ROOM_HOME_PATHNAME}${search}`;
  const pathname = ROOM_SECTION_PATHNAMES[slug];
  if (pathname) return `${pathname}${search}`;
  return `${ROOM_HOME_PATHNAME}${search}#${slug}`;
}

/** The URL the address bar shows for a scene position: the golf stop when
 * the scroll window is centred on the green, else the active shelf's. */
export function sceneUrl(unitIndex: number, golfFocused: boolean, search = "") {
  if (golfFocused) return `${GOLF_PATHNAME}${search}`;
  return unitUrl(unitIndex, search);
}

/** The hash form of a stop, for a return that must land on `/`. The room
 * reads it the way it reads any alias; the next travel writes the canonical
 * URL. */
export function sceneHash(unitIndex: number, golfFocused: boolean) {
  if (golfFocused) return "#golf";
  const slug = unitPublicSlug(unitIndex);
  if (slug === null || unitIndex === HOME_UNIT_INDEX) return "";
  return `#${slug}`;
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
 * the spine needs a width (from length metadata), a Portal Label (title/author)
 * and a click id — never the cover image, so carrying full Book objects here
 * would put the whole library's serialization on the homepage payload for
 * fields no spine reads. Clicks resolve through the books-app modal by id. */
export type StacksSpineBook = {
  id: string;
  title: string;
  author: string;
  pageCount: number | null;
  audioLengthMin: number | null;
  /** Sampled perimeter color for the physical spine, separate from the
   * library's whole-cover sort color. Null uses the theme's cloth palette. */
  edgeColor: string | null;
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
