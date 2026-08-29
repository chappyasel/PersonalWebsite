import { normalizeSearchText, rankSearchCandidates } from "../ranking";
import type { SearchResult } from "../types";
import { resolveDestinationTarget } from "../urls";

import { categoryColor } from "~/app/weightlifting/lib/utils";

export type WeightliftingExerciseRow = {
  slug: string;
  displayName: string;
  name: string;
  category: string;
  setCount: number;
  bestOneRM: number;
};

export type WeightliftingExerciseLoader = (
  signal: AbortSignal,
) => Promise<WeightliftingExerciseRow[]>;

// The exercise index is the same universe the dashboard picker shows, plus
// the slug each exercise's own page lives at — search must land on
// /back-squats, not a ?exercises= chart preselection.
async function defaultExerciseLoader(signal: AbortSignal) {
  if (signal.aborted) throw new Error("search_aborted");
  const { getCachedExerciseIndex } = await import(
    "~/server/queries/weightliftingExercise"
  );
  const rows = await getCachedExerciseIndex();
  if (signal.aborted) throw new Error("search_aborted");
  return rows;
}

export async function searchWeightliftingExercises(
  query: string,
  options: {
    load?: WeightliftingExerciseLoader;
    location: URL;
    signal?: AbortSignal;
  },
): Promise<SearchResult[]> {
  const signal = options.signal ?? new AbortController().signal;
  const normalizedQuery = normalizeSearchText(query);
  const rows = await (options.load ?? defaultExerciseLoader)(signal);
  const ranked = rankSearchCandidates(
    normalizedQuery,
    rows.map((row) => ({
      ...row,
      id: row.displayName,
      label: row.displayName,
      aliases: row.name === row.displayName ? [] : [row.name],
      metadata: [row.category],
    })),
  );

  return ranked.slice(0, 6).map((row) => ({
    id: `weightlifting:${row.displayName}`,
    kind: "content",
    group: "weightlifting",
    label: row.displayName,
    description: `${row.category} · ${Math.round(row.bestOneRM)} lbs est. 1RM`,
    accentColor: categoryColor(row.category),
    href: resolveDestinationTarget(
      { kind: "site", site: "weightlifting", path: `/${row.slug}` },
      options.location,
    ),
    matchKind: row.matchKind,
    score: row.score,
  }));
}
