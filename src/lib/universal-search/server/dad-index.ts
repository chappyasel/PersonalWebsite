import { normalizeSearchText, rankSearchCandidates } from "../ranking";
import type { SearchResult } from "../types";
import { resolveDestinationTarget } from "../urls";
import matter from "gray-matter";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { createServerExcerpt } from "./excerpt";
import { MAX_PROVIDER_RESULTS } from "./search";

export const DAD_SEARCH_INDEX_FILENAME = "dad-search-index.json" as const;

export type DadSearchDocument = {
  id: string;
  label: string;
  href: string;
  metadata: string[];
  body: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDadSearchDocuments(value: unknown): DadSearchDocument[] {
  if (!Array.isArray(value))
    throw new Error("Invalid private Dad search index");
  return value.map((document) => {
    if (
      !isObject(document) ||
      typeof document.id !== "string" ||
      !document.id.startsWith("dad:") ||
      typeof document.label !== "string" ||
      typeof document.href !== "string" ||
      !document.href.startsWith("/dad/") ||
      !Array.isArray(document.metadata) ||
      !document.metadata.every((item) => typeof item === "string") ||
      typeof document.body !== "string"
    ) {
      throw new Error("Invalid private Dad search index");
    }
    return {
      id: document.id,
      label: document.label,
      href: document.href,
      metadata: document.metadata,
      body: document.body,
    };
  });
}

async function markdownDocument(
  rootDir: string,
  relativePath: string,
  details: Omit<DadSearchDocument, "label" | "body" | "metadata"> & {
    fallbackLabel: string;
    metadata?: string[];
  },
): Promise<DadSearchDocument> {
  const raw = await readFile(join(rootDir, relativePath), "utf8");
  const parsed = matter(raw);
  const title: unknown = parsed.data.title;
  return {
    id: details.id,
    label:
      typeof title === "string" && title.trim()
        ? title.trim()
        : details.fallbackLabel,
    href: details.href,
    metadata: details.metadata ?? [],
    body: parsed.content.replace(/^\s*#\s+.+\n*/, "").trim(),
  };
}

export async function buildDadSearchDocuments(rootDir: string) {
  const insightNames = (await readdir(join(rootDir, "Insights")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .filter((slug) => slug !== "bio-updates-draft")
    .sort();
  const insights = await Promise.all(
    insightNames.map((slug) =>
      markdownDocument(rootDir, `Insights/${slug}.md`, {
        id: `dad:insight:${slug}`,
        fallbackLabel: slug === "00-life-story" ? "Life Story" : slug,
        href:
          slug === "00-life-story"
            ? "/dad/life-story"
            : `/dad/insights/${slug}`,
      }),
    ),
  );

  const specialJournal = await Promise.all(
    (["index", "preface", "epilogue"] as const).map((slug) =>
      markdownDocument(rootDir, `Journal/${slug}.md`, {
        id: `dad:journal:${slug}`,
        fallbackLabel: slug === "index" ? "Journal" : slug,
        href: slug === "index" ? "/dad/journal" : `/dad/journal/${slug}`,
      }),
    ),
  );
  const journalEntries = await readdir(join(rootDir, "Journal"), {
    withFileTypes: true,
  });
  const years = journalEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const journal = (
    await Promise.all(
      years.map(async (year) => {
        const slugs = (await readdir(join(rootDir, "Journal", year)))
          .filter((name) => name.endsWith(".md"))
          .map((name) => name.slice(0, -3))
          .sort();
        return Promise.all(
          slugs.map((slug) =>
            markdownDocument(rootDir, `Journal/${year}/${slug}.md`, {
              id: `dad:journal:${year}:${slug}`,
              fallbackLabel: slug,
              href: `/dad/journal/${year}/${slug}`,
              metadata: [year],
            }),
          ),
        );
      }),
    )
  ).flat();

  return [...insights, ...specialJournal, ...journal];
}

export function createDadIndexLoader(
  build: () => Promise<DadSearchDocument[]>,
) {
  let pending: Promise<DadSearchDocument[]> | undefined;
  return () => {
    if (pending) return pending;
    const next = build().catch((error: unknown) => {
      if (pending === next) pending = undefined;
      throw error;
    });
    pending = next;
    return next;
  };
}

const loadDadIndex = createDadIndexLoader(async () => {
  try {
    const raw = await readFile(
      join(process.cwd(), "content", DAD_SEARCH_INDEX_FILENAME),
      "utf8",
    );
    return parseDadSearchDocuments(JSON.parse(raw) as unknown);
  } catch (error) {
    if (
      isObject(error) &&
      "code" in error &&
      error.code === "ENOENT" &&
      process.env.NODE_ENV !== "production"
    ) {
      return buildDadSearchDocuments(join(process.cwd(), "content", "dad"));
    }
    throw error;
  }
});

export async function searchDadIndex(
  query: string,
  options: {
    location: URL;
    signal?: AbortSignal;
    load?: () => Promise<DadSearchDocument[]>;
  },
): Promise<SearchResult[]> {
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const documents = await (options.load ?? loadDadIndex)();
  signal.throwIfAborted();
  const normalizedQuery = normalizeSearchText(query);

  return rankSearchCandidates(normalizedQuery, documents)
    .slice(0, MAX_PROVIDER_RESULTS)
    .map((document) => ({
      id: document.id,
      kind: "content",
      group: "dad",
      label: document.label,
      href: resolveDestinationTarget(
        { kind: "site", site: "home", path: document.href },
        options.location,
      ),
      ...(document.matchKind === "body"
        ? { excerpt: createServerExcerpt(document.body, normalizedQuery) }
        : {}),
      matchKind: document.matchKind,
      score: document.score,
    }));
}
