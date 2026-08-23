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

export type CommandDestinationEntry = CommandEntryBase & {
  kind: "destination";
  target: CommandDestinationTarget;
};

export type CommandActionEntry = CommandEntryBase & {
  kind: "action";
  actionId: CommandActionId;
};

export type CommandEntry = CommandDestinationEntry | CommandActionEntry;
