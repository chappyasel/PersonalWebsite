import { normalizeSearchText, rankSearchCandidates } from "../ranking";
import type { SearchResult } from "../types";
import { resolveDestinationTarget } from "../urls";

import { wlSearchParamsSerializer } from "~/app/weightlifting/lib/searchParams";

export type WeightliftingExerciseRow = {
  displayName: string;
  name: string;
  category: string;
  setCount: number;
  bestOneRM: number;
};

export type WeightliftingExerciseLoader = (
  minSets: number,
  signal: AbortSignal,
) => Promise<WeightliftingExerciseRow[]>;

async function defaultExerciseLoader(minSets: number, signal: AbortSignal) {
  if (signal.aborted) throw new Error("search_aborted");
  const { getChartSelectableExercises } = await import(
    "~/server/queries/weightliftingExercises"
  );
  const rows = await getChartSelectableExercises(minSets);
  if (signal.aborted) throw new Error("search_aborted");
  return rows;
}

export function serializeExerciseDestination(exercise: string, location: URL) {
  return wlSearchParamsSerializer(
    new URL(
      resolveDestinationTarget(
        { kind: "site", site: "weightlifting" },
        location,
      ),
    ),
    { exercises: [exercise] },
  );
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
  const rows = await (options.load ?? defaultExerciseLoader)(10, signal);
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
    description: row.category,
    href: serializeExerciseDestination(row.displayName, options.location),
    matchKind: row.matchKind,
    score: row.score,
  }));
}
