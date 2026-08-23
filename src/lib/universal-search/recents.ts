import type { SearchResult, SearchResultKind } from "./types";

export const RECENT_RESULTS_STORAGE_KEY = "universal-search-recents:v1";
export const RECENT_RESULTS_LIMIT = 8;

export type RecentResult = {
  id: string;
  kind: Exclude<SearchResultKind, "action">;
  label: string;
  href: string;
  selectedAt: number;
};

type StoredRecents = {
  version: 1;
  items: RecentResult[];
};

function isYoutubeHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return ["youtube.com", "youtube-nocookie.com", "youtu.be"].some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

export function isSafeRecentHref(href: string) {
  if (href.startsWith("//")) return false;
  if (href.startsWith("/")) return true;

  try {
    const url = new URL(href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !isYoutubeHost(url.hostname)
    );
  } catch {
    return false;
  }
}

function isRecentResult(value: unknown): value is RecentResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentResult>;
  return (
    typeof candidate.id === "string" &&
    (candidate.kind === "destination" || candidate.kind === "content") &&
    typeof candidate.label === "string" &&
    typeof candidate.href === "string" &&
    isSafeRecentHref(candidate.href) &&
    typeof candidate.selectedAt === "number" &&
    Number.isFinite(candidate.selectedAt)
  );
}

export function readRecentResults(storage: Storage): RecentResult[] {
  try {
    const raw = storage.getItem(RECENT_RESULTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredRecents>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isRecentResult).slice(0, RECENT_RESULTS_LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentResult(
  storage: Storage,
  result: SearchResult,
  selectedAt = Date.now(),
) {
  if (
    result.group === "dad" ||
    result.kind === "action" ||
    typeof result.href !== "string" ||
    !isSafeRecentHref(result.href)
  ) {
    return readRecentResults(storage);
  }

  const next: RecentResult = {
    id: result.id,
    kind: result.kind,
    label: result.label,
    href: result.href,
    selectedAt,
  };
  const items = [
    next,
    ...readRecentResults(storage).filter((recent) => recent.id !== result.id),
  ].slice(0, RECENT_RESULTS_LIMIT);

  try {
    storage.setItem(
      RECENT_RESULTS_STORAGE_KEY,
      JSON.stringify({ version: 1, items } satisfies StoredRecents),
    );
  } catch {
    // Recent results are optional. Storage failures must not block navigation.
  }
  return items;
}

export function clearRecentResults(storage: Storage) {
  try {
    storage.removeItem(RECENT_RESULTS_STORAGE_KEY);
  } catch {
    // Clearing is best effort when browser storage is unavailable.
  }
}
