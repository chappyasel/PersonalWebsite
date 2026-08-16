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
  /** Internal key and URL hash. Deliberately NOT renamed to match `label` —
   * it is also the key of Scene's UNIT_COMPONENTS map and of the flat page's
   * slot record, and the hash is a URL people can already be holding. */
  slug: UnitSlug;
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
  { slug: "training", label: "Weightlifting", icon: BarbellIcon },
  { slug: "systems", label: "Systems", icon: CompassIcon },
  { slug: "projects", label: "Projects", icon: CodeIcon },
  { slug: "blog", label: "Musings", icon: PenNibIcon },
  {
    slug: "talks",
    label: "Featured Talks",
    railLabel: "Talks",
    icon: MicrophoneStageIcon,
  },
];

export const UNIT_COUNT = UNITS.length;

export function unitIndexFromHash(hash: string): number | null {
  const slug = hash.replace(/^#/, "");
  const index = UNITS.findIndex((unit) => unit.slug === slug);
  return index === -1 ? null : index;
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

export type StacksData = {
  covers: HomepageBookCover[];
  /** Full Book objects for the covers rendered in-scene — instant modal open. */
  shelfBooks: Book[];
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
