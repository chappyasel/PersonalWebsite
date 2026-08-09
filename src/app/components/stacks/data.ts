// The Stacks — unit registry, serializable home-page data contract, and small
// formatters. Client-safe: no JSON imports, no server-only modules.
import type { ReactNode } from "react";

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

export const UNITS: { slug: UnitSlug; label: string; railLabel: string }[] = [
  { slug: "about", label: "About", railLabel: "About" },
  { slug: "books", label: "Book Notes", railLabel: "Books" },
  { slug: "training", label: "Training", railLabel: "Training" },
  { slug: "talks", label: "Featured Talks", railLabel: "Talks" },
  { slug: "projects", label: "Projects", railLabel: "Projects" },
  { slug: "blog", label: "Musings", railLabel: "Musings" },
  { slug: "systems", label: "Systems", railLabel: "Systems" },
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
  bookStats: HomepageBookStats;
  reading: { title: string; coverUrl: string | null } | null;
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

