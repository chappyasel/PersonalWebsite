export const PUBLIC_SEARCH_INDEX_VERSION = 1 as const;
export const PUBLIC_SEARCH_INDEX_PATH =
  "/data/universal-search-index.json" as const;

export const PUBLIC_SEARCH_SOURCES = [
  "manual",
  "routine",
  "systems",
  "musing",
  "project",
] as const;

export type PublicSearchSource = (typeof PUBLIC_SEARCH_SOURCES)[number];

export type PublicSearchTarget =
  | {
      kind: "site";
      site: "home" | "manual" | "routine";
      path?: string;
      hash?: string;
    }
  | { kind: "url"; url: string };

export type PublicSearchDocument = {
  id: string;
  source: PublicSearchSource;
  label: string;
  target: PublicSearchTarget;
  metadata: string[];
  body: string;
  /** Root-relative path or https URL of a small result thumbnail. */
  image?: string;
};

export type PublicSearchIndex = {
  version: typeof PUBLIC_SEARCH_INDEX_VERSION;
  sourceDigest: string;
  documents: PublicSearchDocument[];
};

export function isYouTubeUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname.endsWith(".youtu.be") ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}
