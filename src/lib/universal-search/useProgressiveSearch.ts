"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ServerSearchResponse } from "./server/search";

import { normalizeSearchText } from "./ranking";
import type { SearchResult, SearchResultGroup } from "./types";

export const UNIVERSAL_SEARCH_DEBOUNCE_MS = 140;

export type AsyncSearchGroup = Extract<
  SearchResultGroup,
  "books" | "public-writing" | "weightlifting" | "dad"
>;
export type SearchGroupStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "skipped";

export type SearchGroupState = {
  status: SearchGroupStatus;
  results: SearchResult[];
};

export type ServerSearchPayload = Pick<ServerSearchResponse, "groups">;

type CacheableGroup = Exclude<AsyncSearchGroup, "dad">;
type CachedGroups = Partial<Record<CacheableGroup, SearchResult[]>>;
type SearchState = {
  query: string;
  groups: Record<AsyncSearchGroup, SearchGroupState>;
};

export type SearchSessionCache = {
  read: (query: string) => CachedGroups;
  write: (
    query: string,
    group: CacheableGroup,
    results: SearchResult[],
  ) => void;
};

export type ProgressiveProviderSettlement = {
  provider: "public-content" | "server";
  durationMs: number;
  resultCount: number;
  outcome: "success" | "error";
};

export function createSearchSessionCache(): SearchSessionCache {
  const entries = new Map<string, CachedGroups>();
  return {
    read: (query) => entries.get(query) ?? {},
    write: (query, group, results) => {
      entries.set(query, { ...entries.get(query), [group]: results });
    },
  };
}

const sessionCache = createSearchSessionCache();
const ASYNC_GROUP_ORDER: readonly AsyncSearchGroup[] = [
  "books",
  "public-writing",
  "weightlifting",
  "dad",
];

function emptyGroups(): Record<AsyncSearchGroup, SearchGroupState> {
  return {
    books: { status: "idle", results: [] },
    "public-writing": { status: "idle", results: [] },
    weightlifting: { status: "idle", results: [] },
    dad: { status: "idle", results: [] },
  };
}

function loadingGroups(cached: CachedGroups) {
  const fromCache = (group: CacheableGroup): SearchGroupState =>
    cached[group]
      ? { status: "success", results: cached[group] }
      : { status: "loading", results: [] };

  return {
    books: fromCache("books"),
    "public-writing": fromCache("public-writing"),
    weightlifting: fromCache("weightlifting"),
    dad: { status: "loading", results: [] },
  } satisfies Record<AsyncSearchGroup, SearchGroupState>;
}

export function preserveSelectedResultId(
  selectedId: string | undefined,
  results: readonly Pick<SearchResult, "id">[],
) {
  if (selectedId && results.some((result) => result.id === selectedId)) {
    return selectedId;
  }
  return results[0]?.id;
}

export function useProgressiveSearch({
  query,
  enabled,
  searchPublic,
  searchServer,
  cache = sessionCache,
  onProviderSettled,
}: {
  query: string;
  enabled: boolean;
  searchPublic: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
  searchServer: (
    query: string,
    signal: AbortSignal,
  ) => Promise<ServerSearchPayload>;
  cache?: SearchSessionCache;
  onProviderSettled?: (settlement: ProgressiveProviderSettlement) => void;
}) {
  const normalizedQuery = normalizeSearchText(query);
  const [searchState, setSearchState] = useState<SearchState>(() => ({
    query: "",
    groups: emptyGroups(),
  }));
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!enabled || normalizedQuery.length < 2) {
      setSearchState((current) =>
        current.query ? { query: "", groups: emptyGroups() } : current,
      );
      return;
    }

    const cached = cache.read(normalizedQuery);
    const abortController = new AbortController();
    const isCurrent = () =>
      requestIdRef.current === requestId && !abortController.signal.aborted;

    const timeout = window.setTimeout(() => {
      if (!isCurrent()) return;
      setSearchState({
        query: normalizedQuery,
        groups: loadingGroups(cached),
      });
      if (!cached["public-writing"]) {
        const publicStartedAt = performance.now();
        void searchPublic(normalizedQuery, abortController.signal).then(
          (results) => {
            if (!isCurrent()) return;
            cache.write(normalizedQuery, "public-writing", results);
            setSearchState((current) =>
              current.query === normalizedQuery
                ? {
                    ...current,
                    groups: {
                      ...current.groups,
                      "public-writing": { status: "success", results },
                    },
                  }
                : current,
            );
            onProviderSettled?.({
              provider: "public-content",
              durationMs: performance.now() - publicStartedAt,
              resultCount: results.length,
              outcome: "success",
            });
          },
          () => {
            if (!isCurrent()) return;
            setSearchState((current) =>
              current.query === normalizedQuery
                ? {
                    ...current,
                    groups: {
                      ...current.groups,
                      "public-writing": { status: "error", results: [] },
                    },
                  }
                : current,
            );
            onProviderSettled?.({
              provider: "public-content",
              durationMs: performance.now() - publicStartedAt,
              resultCount: 0,
              outcome: "error",
            });
          },
        );
      }

      const serverStartedAt = performance.now();
      void searchServer(normalizedQuery, abortController.signal).then(
        (response) => {
          if (!isCurrent()) return;
          const nextServerGroups = {} as Pick<
            Record<AsyncSearchGroup, SearchGroupState>,
            "books" | "weightlifting" | "dad"
          >;
          for (const group of ["books", "weightlifting", "dad"] as const) {
            const incoming = response.groups[group];
            if (group !== "dad" && incoming.status === "success") {
              cache.write(normalizedQuery, group, incoming.results);
            }
            nextServerGroups[group] = {
              status: incoming.status,
              results: incoming.status === "success" ? incoming.results : [],
            };
          }
          setSearchState((current) =>
            current.query === normalizedQuery
              ? {
                  ...current,
                  groups: { ...current.groups, ...nextServerGroups },
                }
              : current,
          );
          onProviderSettled?.({
            provider: "server",
            durationMs: performance.now() - serverStartedAt,
            resultCount: Object.values(response.groups).reduce(
              (count, group) => count + group.results.length,
              0,
            ),
            outcome: "success",
          });
        },
        () => {
          if (!isCurrent()) return;
          setSearchState((current) =>
            current.query === normalizedQuery
              ? {
                  ...current,
                  groups: {
                    ...current.groups,
                    books:
                      current.groups.books.status === "success"
                        ? current.groups.books
                        : { status: "error", results: [] },
                    weightlifting:
                      current.groups.weightlifting.status === "success"
                        ? current.groups.weightlifting
                        : { status: "error", results: [] },
                    dad: { status: "error", results: [] },
                  },
                }
              : current,
          );
          onProviderSettled?.({
            provider: "server",
            durationMs: performance.now() - serverStartedAt,
            resultCount: 0,
            outcome: "error",
          });
        },
      );
    }, UNIVERSAL_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [
    cache,
    enabled,
    normalizedQuery,
    onProviderSettled,
    searchPublic,
    searchServer,
  ]);

  const eligible = enabled && normalizedQuery.length >= 2;
  const groups = useMemo(
    () =>
      eligible && searchState.query === normalizedQuery
        ? searchState.groups
        : emptyGroups(),
    [eligible, normalizedQuery, searchState],
  );

  const results = useMemo(
    () => ASYNC_GROUP_ORDER.flatMap((group) => groups[group].results),
    [groups],
  );
  const isSettledZero =
    eligible &&
    results.length === 0 &&
    ASYNC_GROUP_ORDER.every(
      (group) =>
        groups[group].status !== "idle" && groups[group].status !== "loading",
    );

  return { groups, results, isSettledZero, normalizedQuery };
}
