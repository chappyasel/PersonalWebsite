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
  /** The unit's ONE name, everywhere it is written.
   *
   * There used to be a second field, `railLabel`, and the two disagreed:
   * the rail said "Books" / "Talks" while the placards said "Book Notes" /
   * "Featured Talks", and "Training" named a section whose only heading is
   * "Weightlifting". A visitor clicking a rail entry landed on a panel with
   * a different title at the top of it.
   *
   * These are the names the SECTIONS use, read off their own markup rather
   * than off either old field — BookNotes/Talks/Projects/BlogPosts h1s, and
   * Weightlifting.tsx, which is the whole of the training placard. Two are
   * container names with no single section behind them and so cannot be
   * copied from one: About (whose placard is an intro and contact, no
   * heading at all) and Systems (Personal Operating Manual + Core Daily
   * Routine + quotes, three sections in one unit). */
  label: string;
  /** The section's own glyph, so the rail entry and the heading it leads to
   * are the same mark. Taken from each section's h1 — BooksIcon, BarbellIcon,
   * MicrophoneStageIcon, CodeIcon, PenNibIcon. The two container units get
   * one of their own: About is the person, Systems is how he navigates. */
  icon: Icon;
};

export const UNITS: Unit[] = [
  { slug: "about", label: "About", icon: UserIcon },
  { slug: "books", label: "Book Notes", icon: BooksIcon },
  { slug: "training", label: "Weightlifting", icon: BarbellIcon },
  { slug: "talks", label: "Featured Talks", icon: MicrophoneStageIcon },
  { slug: "projects", label: "Projects", icon: CodeIcon },
  { slug: "blog", label: "Musings", icon: PenNibIcon },
  { slug: "systems", label: "Systems", icon: CompassIcon },
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
  link: string;
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
   * NOT hard-code eight: read `featuredBooks.length` and let the row size
   * itself, or the ninth tick silently goes missing and an untick leaves a
   * hole. Every entry is also present in `shelfBooks`, which is what
   * `StacksCanvas.onOpenBook` searches by id and what `Scene` warms through
   * the image proxy — so a featured cover is always clickable and pre-decoded.
   *
   * "Featured?" is set per Notion page, not per title: 7 Habits has two reads
   * and only the 2023 one is featured. Match on `book.id` (the slug), never on
   * title. */
  featuredBooks: Book[];
  /** Server-sampled physical-board colors for every featured book. */
  featuredBookColors: Record<string, ReadingBookEdgeColor>;
  /** The newest current read with a cover, or the most recent covered book as
   * a fallback when there is no active current read. */
  readingBooks: Book[];
  /** Server-sampled jacket perimeter color for the About book.
   * This stays scene-only: it does not extend the Notion/DB book schema. */
  readingBookColors: Record<string, ReadingBookEdgeColor>;
  bookStats: HomepageBookStats;
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
  manual: ReactNode;
  routine: ReactNode;
  talks: ReactNode;
  blog: ReactNode;
  projects: ReactNode;
  quotes: ReactNode;
};
