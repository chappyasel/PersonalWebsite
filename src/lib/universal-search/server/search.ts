import { normalizeSearchText } from "../ranking";
import type { SearchResult } from "../types";

import { createServerExcerpt } from "./excerpt";

// A group's ceiling in one response. The palette previews six rows and
// offers the rest behind a "Show more" row, so this is what "all" means to
// it. The books query already ranks and joins 24 rows per request and threw
// eighteen away; a sanitized row is a few hundred bytes, so the whole
// response stays small.
export const MAX_PROVIDER_RESULTS = 24;
export const MAX_SEARCH_QUERY_LENGTH = 80;
// Wide enough that a cold Neon connection plus the ranked note query fits;
// common-token queries ("12") were brushing the old 1.5s ceiling in dev.
export const DEFAULT_SEARCH_TIMEOUT_MS = 2_500;

export type ServerSearchGroup = "books" | "weightlifting" | "dad";
export type ServerProviderStatus = "success" | "error" | "skipped";

export type ServerSearchGroupResult = {
  status: ServerProviderStatus;
  results: SearchResult[];
};

export type ServerSearchResponse = {
  query: string;
  groups: Record<ServerSearchGroup, ServerSearchGroupResult>;
};

export type ServerSearchContext = {
  location: URL;
  signal: AbortSignal;
};

export type ServerSearchProvider = (
  query: string,
  context: ServerSearchContext,
) => Promise<readonly SearchResult[]>;

export type ServerSearchDependencies = {
  books: ServerSearchProvider;
  weightlifting: ServerSearchProvider;
  dad?: ServerSearchProvider;
};

export type ServerSearchOptions = {
  dadAuthorized: boolean;
  timeoutMs?: number;
  onProviderError?: (group: ServerSearchGroup, error: unknown) => void;
};

const PRIVATE_SEARCH_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
} as const;

function codePointLength(value: string) {
  return Array.from(value).length;
}

function clip(value: string, maximum: number) {
  return Array.from(value).slice(0, maximum).join("");
}

export function parseSearchQuery(value: string | null) {
  if (
    value === null ||
    codePointLength(value.trim()) > MAX_SEARCH_QUERY_LENGTH
  ) {
    return null;
  }

  const query = normalizeSearchText(value);
  const normalizedLength = codePointLength(query);
  return normalizedLength >= 2 && normalizedLength <= MAX_SEARCH_QUERY_LENGTH
    ? query
    : null;
}

function sanitizeResults(
  group: ServerSearchGroup,
  results: readonly SearchResult[],
) {
  return results.slice(0, MAX_PROVIDER_RESULTS).map(
    (result): SearchResult => ({
      id: clip(result.id, 180),
      kind: result.kind,
      group,
      label: clip(result.label, 160),
      ...(result.href ? { href: clip(result.href, 2_048) } : {}),
      ...(result.actionId ? { actionId: result.actionId } : {}),
      ...(result.description
        ? { description: createServerExcerpt(result.description, "") }
        : {}),
      ...(result.excerpt
        ? { excerpt: createServerExcerpt(result.excerpt, "") }
        : {}),
      ...(result.imageUrl && /^https?:\/\//.test(result.imageUrl)
        ? { imageUrl: clip(result.imageUrl, 2_048) }
        : {}),
      ...(result.accentColor && /^#[0-9a-f]{6}$/i.test(result.accentColor)
        ? { accentColor: result.accentColor }
        : {}),
      matchKind: result.matchKind,
      score: Number.isFinite(result.score) ? result.score : 0,
    }),
  );
}

async function settleProvider(
  group: ServerSearchGroup,
  provider: ServerSearchProvider,
  query: string,
  context: ServerSearchContext,
  timeoutMs: number,
  onProviderError?: ServerSearchOptions["onProviderError"],
): Promise<ServerSearchGroupResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("search_provider_timeout")),
      timeoutMs,
    );
  });

  try {
    const results = await Promise.race([provider(query, context), timeout]);
    return { status: "success", results: sanitizeResults(group, results) };
  } catch (error) {
    onProviderError?.(group, error);
    return { status: "error", results: [] };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function runServerSearch(
  query: string,
  dependencies: ServerSearchDependencies,
  options: ServerSearchOptions,
  location = new URL("https://www.chappyasel.com"),
): Promise<ServerSearchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  const abortId = setTimeout(() => controller.abort(), timeoutMs);
  const context = { location, signal: controller.signal };

  const booksPromise = settleProvider(
    "books",
    dependencies.books,
    query,
    context,
    timeoutMs,
    options.onProviderError,
  );
  const weightliftingPromise = settleProvider(
    "weightlifting",
    dependencies.weightlifting,
    query,
    context,
    timeoutMs,
    options.onProviderError,
  );
  const dadPromise =
    options.dadAuthorized && dependencies.dad
      ? settleProvider(
          "dad",
          dependencies.dad,
          query,
          context,
          timeoutMs,
          options.onProviderError,
        )
      : Promise.resolve<ServerSearchGroupResult>({
          status: "skipped",
          results: [],
        });

  try {
    const [books, weightlifting, dad] = await Promise.all([
      booksPromise,
      weightliftingPromise,
      dadPromise,
    ]);
    return { query, groups: { books, weightlifting, dad } };
  } finally {
    clearTimeout(abortId);
  }
}

export async function createSearchResponse(
  request: Request,
  dependencies: ServerSearchDependencies,
  options: ServerSearchOptions,
) {
  const requestUrl = new URL(request.url);
  const query = parseSearchQuery(requestUrl.searchParams.get("q"));
  if (!query) {
    return Response.json(
      { error: "invalid_query" },
      { status: 400, headers: PRIVATE_SEARCH_HEADERS },
    );
  }

  const response = await runServerSearch(
    query,
    dependencies,
    options,
    requestUrl,
  );
  return Response.json(response, { headers: PRIVATE_SEARCH_HEADERS });
}
