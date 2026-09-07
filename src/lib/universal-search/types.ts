import type { SitePageKey } from "~/lib/site/pages";

/** Rows a result group shows before offering the rest behind a "Show more"
 * row. The public index keeps this many of every source when it cuts to its
 * limit, so no section's preview is starved by another. */
export const RESULT_GROUP_PREVIEW = 6;

export const SEARCH_RESULT_GROUPS = [
  "destinations",
  "books",
  "public-writing",
  "weightlifting",
  "dad",
  "actions",
] as const;

export type SearchResultGroup = (typeof SEARCH_RESULT_GROUPS)[number];
export type SearchResultKind = "destination" | "content" | "action";
export type SearchMatchKind =
  | "exact"
  | "prefix"
  | "token-prefix"
  | "substring"
  | "alias"
  | "metadata"
  | "body";

export type SearchResult = {
  id: string;
  kind: SearchResultKind;
  group: SearchResultGroup;
  label: string;
  href?: string;
  actionId?: CommandActionId;
  description?: string;
  excerpt?: string;
  imageUrl?: string;
  /** Hex swatch rendered beside the description, e.g. a weightlifting
   *  category color. Server results are sanitized to #rrggbb. */
  accentColor?: string;
  matchKind: SearchMatchKind;
  score: number;
};

export type CommandActionId =
  | "theme-light"
  | "theme-dark"
  | "theme-system"
  | "font-georgia"
  | "font-literata"
  | "font-system"
  | "recents-clear";

export type CommandIconKey =
  | "house"
  | "books"
  | "manual"
  | "routine"
  | "weightlifting"
  | "about"
  | "systems"
  | "projects"
  | "musings"
  | "dice"
  | "sun"
  | "moon"
  | "monitor"
  | "serif"
  | "sans"
  | "trash";

export type SiteTarget =
  | "home"
  | "books"
  | "manual"
  | "routine"
  | "weightlifting";

export type CommandDestinationTarget = {
  kind: "site";
  site: SiteTarget;
  path?: string;
  hash?: string;
};

type CommandEntryBase = {
  id: string;
  label: string;
  aliases: readonly string[];
  keywords: readonly string[];
  icon: CommandIconKey;
  promoted: boolean;
};

/** A destination that is one of the site's own pages (a document such as the
 * Manual, or an app such as Book Notes). The palette gives its row the same
 * tile the page's browser tab wears, from the page's own icon route, and the
 * one-line description the page publishes in its metadata. */
export type CommandPage = SitePageKey;

export type CommandDestinationEntry = CommandEntryBase & {
  kind: "destination";
  target: CommandDestinationTarget;
  page?: CommandPage;
};

export type CommandActionEntry = CommandEntryBase & {
  kind: "action";
  actionId: CommandActionId;
};

export type CommandEntry = CommandDestinationEntry | CommandActionEntry;
