import {
  PUBLIC_SEARCH_INDEX_PATH,
  PUBLIC_SEARCH_INDEX_VERSION,
  PUBLIC_SEARCH_SOURCES,
  type PublicSearchDocument,
  type PublicSearchIndex,
  type PublicSearchTarget,
  isYouTubeUrl,
} from "./public-index-format";
import { rankSearchCandidates } from "./ranking";
import { RESULT_GROUP_PREVIEW, type SearchResult } from "./types";
import type { SearchLocation } from "./urls";
import { resolveDestinationTarget } from "./urls";

type JsonObject = Record<string, unknown>;
type FetchPublicIndex = (
  input: string,
  init: { cache: "no-cache" },
) => Promise<Response>;

let publicIndexPromise: Promise<PublicSearchIndex> | undefined;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function parseTarget(value: unknown): PublicSearchTarget {
  if (!isObject(value) || typeof value.kind !== "string") {
    throw new Error("Public search document has an invalid target");
  }
  if (value.kind === "url") {
    if (typeof value.url !== "string" || isYouTubeUrl(value.url)) {
      throw new Error("Public search document has a forbidden URL");
    }
    let url: URL;
    try {
      url = new URL(value.url);
    } catch {
      throw new Error("Public search document has a forbidden URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Public search document URL must use HTTP or HTTPS");
    }
    return { kind: "url", url: value.url };
  }
  if (
    value.kind !== "site" ||
    (value.site !== "home" &&
      value.site !== "manual" &&
      value.site !== "routine") ||
    (value.path !== undefined &&
      (typeof value.path !== "string" ||
        !value.path.startsWith("/") ||
        value.path.startsWith("//"))) ||
    (value.hash !== undefined && typeof value.hash !== "string")
  ) {
    throw new Error("Public search document has an invalid site target");
  }
  return {
    kind: "site",
    site: value.site,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(typeof value.hash === "string" ? { hash: value.hash } : {}),
  };
}

function isValidDocumentImage(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return value.startsWith("https://") && !isYouTubeUrl(value);
}

function parseDocument(value: unknown): PublicSearchDocument {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    !value.id.startsWith("public:") ||
    !PUBLIC_SEARCH_SOURCES.some((source) => source === value.source) ||
    typeof value.label !== "string" ||
    !value.label ||
    !isStringArray(value.metadata) ||
    typeof value.body !== "string" ||
    (value.image !== undefined &&
      (typeof value.image !== "string" || !isValidDocumentImage(value.image)))
  ) {
    throw new Error("Public search asset contains an invalid document");
  }
  return {
    id: value.id,
    source: value.source as PublicSearchDocument["source"],
    label: value.label,
    target: parseTarget(value.target),
    metadata: value.metadata,
    body: value.body,
    ...(typeof value.image === "string" ? { image: value.image } : {}),
  };
}

export function parsePublicSearchIndex(value: unknown): PublicSearchIndex {
  if (
    !isObject(value) ||
    value.version !== PUBLIC_SEARCH_INDEX_VERSION ||
    typeof value.sourceDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sourceDigest) ||
    !Array.isArray(value.documents)
  ) {
    throw new Error("Public search asset has an unsupported format");
  }
  const documents = value.documents.map(parseDocument);
  if (
    new Set(documents.map((document) => document.id)).size !== documents.length
  ) {
    throw new Error("Public search asset contains duplicate document IDs");
  }
  return {
    version: PUBLIC_SEARCH_INDEX_VERSION,
    sourceDigest: value.sourceDigest,
    documents,
  };
}

export function loadPublicSearchIndex(
  fetcher: FetchPublicIndex = globalThis.fetch,
) {
  if (publicIndexPromise) return publicIndexPromise;
  const pending = fetcher(PUBLIC_SEARCH_INDEX_PATH, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Public search asset returned ${response.status}`);
      }
      return parsePublicSearchIndex((await response.json()) as unknown);
    })
    .catch((error: unknown) => {
      if (publicIndexPromise === pending) publicIndexPromise = undefined;
      throw error;
    });
  publicIndexPromise = pending;
  return pending;
}

export function clearPublicSearchIndexCacheForTests() {
  publicIndexPromise = undefined;
}

function plainText(value: string) {
  return value
    .replace(/&(?:lt|#0*60|#x0*3c);/gi, "<")
    .replace(/&(?:gt|#0*62|#x0*3e);/gi, ">")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createPlainTextExcerpt(
  value: string,
  rawQuery: string,
  limit = 220,
) {
  const text = plainText(value);
  const codePoints = Array.from(text);
  if (codePoints.length <= limit) return text;

  const query = rawQuery.trim().toLocaleLowerCase();
  const matchIndex = text.toLocaleLowerCase().indexOf(query);
  const matchCodePointIndex =
    matchIndex < 0 ? 0 : Array.from(text.slice(0, matchIndex)).length;
  const contentBudget = Math.max(0, limit - 2);
  const start = Math.max(
    0,
    matchCodePointIndex - Math.floor(contentBudget / 3),
  );
  const end = Math.min(codePoints.length, start + contentBudget);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < codePoints.length ? "…" : "";
  return `${prefix}${codePoints.slice(start, end).join("")}${suffix}`;
}

function resolveTarget(target: PublicSearchTarget, location: SearchLocation) {
  if (target.kind === "url") return target.url;
  return resolveDestinationTarget(
    {
      kind: "site",
      site: target.site,
      ...(target.path ? { path: target.path } : {}),
      ...(target.hash ? { hash: target.hash } : {}),
    },
    location,
  );
}

/** The index is searched in the browser, so the only cost of a match is a
 * row; this ceiling guards the list against a two-letter query, not the
 * wire. The palette previews RESULT_GROUP_PREVIEW rows per section and
 * offers the rest. */
export const PUBLIC_INDEX_RESULT_LIMIT = 60;

/**
 * Cut a ranked list to `limit` while keeping the first `reserve` rows of
 * every source. Equal scores keep index order, and the index lists Manual,
 * Routine, and Systems before Musings and Projects, so a plain top-N cut of
 * a broad query would hand every row to the early sources and a later
 * section would vanish from the palette. Order is preserved.
 */
export function capWithSourceReserve<Document extends { source: string }>(
  ranked: readonly Document[],
  limit: number,
  reserve: number,
): Document[] {
  if (ranked.length <= limit) return [...ranked];
  const reservedPerSource = new Map<string, number>();
  const kept = new Set<number>();
  ranked.forEach((document, index) => {
    const count = reservedPerSource.get(document.source) ?? 0;
    if (count < reserve && kept.size < limit) {
      reservedPerSource.set(document.source, count + 1);
      kept.add(index);
    }
  });
  for (let index = 0; index < ranked.length && kept.size < limit; index++) {
    kept.add(index);
  }
  return ranked.filter((_, index) => kept.has(index));
}

export function searchLoadedPublicIndex(
  index: PublicSearchIndex,
  rawQuery: string,
  location: SearchLocation,
  limit = PUBLIC_INDEX_RESULT_LIMIT,
): SearchResult[] {
  const ranked = rankSearchCandidates(
    rawQuery,
    index.documents.map((document) => ({
      ...document,
      metadata: document.metadata,
      body: document.body,
    })),
  );
  return capWithSourceReserve(ranked, limit, RESULT_GROUP_PREVIEW).map(
    (document) => ({
      id: document.id,
      kind: "content",
      group: "public-writing",
      label: document.label,
      href: resolveTarget(document.target, location),
      // The palette headings already name the section (Manual, Routine,
      // Musings, Projects); the row's own line carries the metadata that
      // differs per document — a routine slot's time, a project's languages,
      // a musing's host.
      description: document.metadata.filter(Boolean).join(" · "),
      ...(document.image ? { imageUrl: document.image } : {}),
      ...(document.matchKind === "body"
        ? { excerpt: createPlainTextExcerpt(document.body, rawQuery) }
        : {}),
      matchKind: document.matchKind,
      score: document.score,
    }),
  );
}

export type QueryPublicSearchIndexOptions = {
  location: SearchLocation;
  signal?: AbortSignal;
  fetcher?: FetchPublicIndex;
};

export async function queryPublicSearchIndex(
  rawQuery: string,
  options: QueryPublicSearchIndexOptions,
) {
  options.signal?.throwIfAborted();
  const index = await loadPublicSearchIndex(options.fetcher);
  options.signal?.throwIfAborted();
  return searchLoadedPublicIndex(index, rawQuery, options.location);
}
