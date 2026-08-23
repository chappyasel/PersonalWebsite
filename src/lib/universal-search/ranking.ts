import type { SearchMatchKind } from "./types";

export type SearchCandidate = {
  id: string;
  label: string;
  aliases?: readonly string[];
  metadata?: readonly string[];
  body?: string;
};

export type RankedSearchCandidate<Candidate extends SearchCandidate> =
  Candidate & {
    matchKind: SearchMatchKind;
    score: number;
  };

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function labelScore(label: string, query: string) {
  if (label === query) return { matchKind: "exact", score: 1_000 } as const;
  if (label.startsWith(query))
    return { matchKind: "prefix", score: 900 } as const;
  if (label.split(" ").some((token) => token.startsWith(query))) {
    return { matchKind: "token-prefix", score: 850 } as const;
  }
  if (label.includes(query))
    return { matchKind: "substring", score: 800 } as const;
  return null;
}

function collectionIncludes(
  values: readonly string[] | undefined,
  query: string,
) {
  return values?.some((value) => normalizeSearchText(value).includes(query));
}

export function rankSearchCandidates<Candidate extends SearchCandidate>(
  rawQuery: string,
  candidates: readonly Candidate[],
): Array<RankedSearchCandidate<Candidate>> {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const ranked = candidates
    .map((candidate, sourceIndex) => {
      const identity = labelScore(normalizeSearchText(candidate.label), query);
      const match =
        identity ??
        (collectionIncludes(candidate.aliases, query)
          ? ({ matchKind: "alias", score: 700 } as const)
          : collectionIncludes(candidate.metadata, query)
            ? ({ matchKind: "metadata", score: 600 } as const)
            : normalizeSearchText(candidate.body ?? "").includes(query)
              ? ({ matchKind: "body", score: 400 } as const)
              : null);

      return match ? { candidate, ...match, sourceIndex } : null;
    })
    .filter((candidate) => candidate !== null)
    .sort(
      (left, right) =>
        right.score - left.score || left.sourceIndex - right.sourceIndex,
    );

  return ranked.map(
    ({ candidate, matchKind, score }) =>
      ({ ...candidate, matchKind, score }) as RankedSearchCandidate<Candidate>,
  );
}
